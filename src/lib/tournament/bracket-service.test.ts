import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { cancelMatch, recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { confirmKnockoutSeeding, getKnockoutSeedingDraft } from './knockout-seeding-service';
import { seedTournamentWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function playAllGroupMatches(teamIds: string[]) {
  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
}

async function setup() {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  const t = (await testDb.tournament.findUnique({ where: { id: tournamentId } }))!;
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });
  return { t, teamIds };
}

it('小组未赛完不能收', async () => {
  const { t } = await setup();
  await expect(closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/未完成/);
});

it('countable canceled group match cannot be closed through compatibility helper', async () => {
  const { t, teamIds } = await setup();
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

  await expect(closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/未完成/);
});

it('manual seeding fills arbitrary first-round pairs and moves to KNOCKOUT', async () => {
  const { t, teamIds } = await setup();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, t.id);
  await confirmKnockoutSeeding(testDb, {
    tournamentId: t.id,
    slots: [
      { matchId: draft.slots[0].matchId, slot: draft.slots[0].slot, teamId: teamIds[5] },
      { matchId: draft.slots[1].matchId, slot: draft.slots[1].slot, teamId: teamIds[0] },
      { matchId: draft.slots[2].matchId, slot: draft.slots[2].slot, teamId: teamIds[1] },
      { matchId: draft.slots[3].matchId, slot: draft.slots[3].slot, teamId: teamIds[4] },
    ],
    actorUserId: 'u',
  });

  const status = (await testDb.tournament.findUnique({ where: { id: t.id } }))!.status;
  expect(status).toBe('KNOCKOUT');

  const sfs = await testDb.match.findMany({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } });
  const pairs = sfs.map((m) => [m.teamAId, m.teamBId]);
  expect(pairs).toContainEqual([teamIds[5], teamIds[0]]);
  expect(pairs).toContainEqual([teamIds[1], teamIds[4]]);
});
