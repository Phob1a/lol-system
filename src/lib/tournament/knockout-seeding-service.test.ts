import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { setupGroupStage } from './score-service.test-helpers';
import { addCustomMatch } from './schedule-service';
import { cancelMatch, recordGame } from './score-service';
import {
  confirmKnockoutSeeding,
  getKnockoutSeedingDraft,
  type KnockoutSeedAssignment,
  type KnockoutSeedingDraft,
} from './knockout-seeding-service';

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

function arbitrarySlots(draft: KnockoutSeedingDraft): KnockoutSeedAssignment[] {
  return [
    { matchId: draft.slots[0].matchId, slot: draft.slots[0].slot, teamId: draft.candidates[3].teamId },
    { matchId: draft.slots[1].matchId, slot: draft.slots[1].slot, teamId: draft.candidates[0].teamId },
    { matchId: draft.slots[2].matchId, slot: draft.slots[2].slot, teamId: draft.candidates[1].teamId },
    { matchId: draft.slots[3].matchId, slot: draft.slots[3].slot, teamId: draft.candidates[2].teamId },
  ];
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

it('confirms arbitrary qualified-team placement and moves tournament to knockout', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  await confirmKnockoutSeeding(testDb, {
    tournamentId,
    slots: arbitrarySlots(draft),
    actorUserId: 'u',
  });

  const tournament = await testDb.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  expect(tournament.status).toBe('KNOCKOUT');
  const sfs = await testDb.match.findMany({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } });
  expect(sfs.map((m) => [m.teamAId, m.teamBId])).toEqual([
    [teamIds[5], teamIds[0]],
    [teamIds[1], teamIds[4]],
  ]);
});

it('rejects confirmation when a first-round knockout match is dirty', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  await testDb.match.update({
    where: { id: draft.slots[0].matchId },
    data: { status: 'CANCELED' },
  });

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: arbitrarySlots(draft),
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/已开始|修改|重新排位/);
});

it('rejects confirmation when first-round knockout slots already contain teams', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  await testDb.match.update({
    where: { id: draft.slots[0].matchId },
    data: { teamAId: teamIds[0] },
  });

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: arbitrarySlots(draft),
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/已开始|修改|重新排位/);

  const firstRound = await testDb.match.findUniqueOrThrow({ where: { id: draft.slots[0].matchId } });
  expect(firstRound.teamAId).toBe(teamIds[0]);
  expect(firstRound.teamBId).toBeNull();
});

it('writes normalized confirmation audit payload', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  const slots = arbitrarySlots(draft);

  await confirmKnockoutSeeding(testDb, {
    tournamentId,
    slots: [...slots].reverse(),
    actorUserId: 'admin-user',
  });

  const audit = await testDb.auditLog.findFirstOrThrow({
    where: { entityId: tournamentId, action: 'tournament.knockout.seed.confirm' },
  });
  const payload = audit.payload as {
    slots: KnockoutSeedAssignment[];
    candidates: Array<{ seedLabel: string; teamId: string }>;
  };
  expect(audit.userId).toBe('admin-user');
  expect(audit.entity).toBe('Tournament');
  expect(payload.slots).toEqual(slots);
  expect(payload.candidates).toEqual([
    { seedLabel: 'A1', teamId: teamIds[0] },
    { seedLabel: 'A2', teamId: teamIds[1] },
    { seedLabel: 'B1', teamId: teamIds[4] },
    { seedLabel: 'B2', teamId: teamIds[5] },
  ]);
});

it('rejects stale tournament status without overwriting first-round teams', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  await testDb.match.update({
    where: { id: draft.slots[0].matchId },
    data: { teamAId: teamIds[0], teamBId: teamIds[5] },
  });
  await testDb.tournament.update({ where: { id: tournamentId }, data: { status: 'KNOCKOUT' } });

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: arbitrarySlots(draft),
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/当前状态|淘汰赛排位|状态/);

  const firstRound = await testDb.match.findUniqueOrThrow({ where: { id: draft.slots[0].matchId } });
  expect([firstRound.teamAId, firstRound.teamBId]).toEqual([teamIds[0], teamIds[5]]);
});

it('rejects duplicate team assignments', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  const slots = arbitrarySlots(draft);
  slots[1] = { ...slots[1], teamId: slots[0].teamId };

  await expect(
    confirmKnockoutSeeding(testDb, { tournamentId, slots, actorUserId: 'u' }),
  ).rejects.toThrow(/重复/);
});

it('rejects missing slot assignments', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: arbitrarySlots(draft).slice(1),
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/未覆盖|缺少/);
});

it('rejects non-qualified team assignments', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  const slots = arbitrarySlots(draft);
  slots[0] = { ...slots[0], teamId: teamIds[2] };

  await expect(
    confirmKnockoutSeeding(testDb, { tournamentId, slots, actorUserId: 'u' }),
  ).rejects.toThrow(/出线|qualified|资格/);
});
