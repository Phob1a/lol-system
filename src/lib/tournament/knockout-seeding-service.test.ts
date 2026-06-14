import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { setupGroupStage } from './score-service.test-helpers';
import { addCustomMatch } from './schedule-service';
import { cancelMatch, recordGame } from './score-service';
import { getKnockoutSeedingDraft } from './knockout-seeding-service';

beforeEach(resetDb);

async function playAllGroupMatches(teamIds: string[]) {
  const groupMatches = await testDb.match.findMany({
    where: { groupId: { not: null } },
    orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
  });

  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, {
      matchId: gm.id,
      expectedVersion: fresh.version,
      winnerTeamId: winner,
      actorUserId: 'u',
    });
  }
}

async function recordGroupMatchWinner(teamAId: string, teamBId: string, winnerTeamId: string) {
  const match = await testDb.match.findFirstOrThrow({
    where: {
      groupId: { not: null },
      OR: [
        { teamAId, teamBId },
        { teamAId: teamBId, teamBId: teamAId },
      ],
    },
  });
  const fresh = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  await recordGame(testDb, {
    matchId: match.id,
    expectedVersion: fresh.version,
    winnerTeamId,
    actorUserId: 'u',
  });
}

it('builds qualified candidates and first-round slots after all group matches finish', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);

  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  expect(draft.tournamentId).toBe(tournamentId);
  expect(draft.candidates.map((c) => c.seedLabel)).toEqual(['A1', 'A2', 'B1', 'B2']);
  expect(draft.candidates.map((c) => c.teamId)).toEqual([teamIds[0], teamIds[1], teamIds[4], teamIds[5]]);
  expect(draft.slots).toHaveLength(4);
  expect(draft.slots.every((s) => s.roundKey === 'SF')).toBe(true);
  expect(draft.defaultSlots).toHaveLength(4);
  expect(draft.defaultSlots).toHaveLength(draft.slots.length);
});

it('rejects draft generation while a group match is still scheduled', async () => {
  const { tournamentId } = await setupGroupStage();

  await expect(getKnockoutSeedingDraft(testDb, tournamentId)).rejects.toThrow(/未完成/);
});

it('rejects draft generation when a countable group match is canceled', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const match = await testDb.match.findFirstOrThrow({
    where: {
      countsForStandings: true,
      groupId: { not: null },
      OR: [
        { teamAId: teamIds[2], teamBId: teamIds[3] },
        { teamAId: teamIds[3], teamBId: teamIds[2] },
      ],
    },
  });
  const fresh = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  await cancelMatch(testDb, { matchId: match.id, expectedVersion: fresh.version, actorUserId: 'u' });

  await expect(getKnockoutSeedingDraft(testDb, tournamentId)).rejects.toThrow(/未完成/);
});

it('ignores non-counting canceled group custom matches during draft generation', async () => {
  const { tournamentId, teamIds, groups } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const customMatch = await addCustomMatch(testDb, {
    tournamentId,
    groupId: groups[0].id,
    teamAId: teamIds[0],
    teamBId: teamIds[1],
    bestOf: 1,
    label: '表演赛',
    countsForStandings: false,
    actorUserId: 'u',
  });
  await cancelMatch(testDb, { matchId: customMatch.id, expectedVersion: customMatch.version, actorUserId: 'u' });

  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  expect(draft.candidates.map((c) => c.seedLabel)).toEqual(['A1', 'A2', 'B1', 'B2']);
});

it('rejects draft generation when advancing standings are tied', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await recordGroupMatchWinner(teamIds[0], teamIds[1], teamIds[0]);
  await recordGroupMatchWinner(teamIds[1], teamIds[2], teamIds[1]);
  await recordGroupMatchWinner(teamIds[0], teamIds[2], teamIds[2]);
  await recordGroupMatchWinner(teamIds[0], teamIds[3], teamIds[0]);
  await recordGroupMatchWinner(teamIds[1], teamIds[3], teamIds[1]);
  await recordGroupMatchWinner(teamIds[2], teamIds[3], teamIds[2]);

  for (let index = 4; index < 8; index += 1) {
    for (let opponent = index + 1; opponent < 8; opponent += 1) {
      await recordGroupMatchWinner(teamIds[index], teamIds[opponent], teamIds[index]);
    }
  }

  await expect(getKnockoutSeedingDraft(testDb, tournamentId)).rejects.toThrow(/并列/);
});
