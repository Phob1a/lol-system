import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

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
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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

it('收小组：按名次交叉填入首轮，状态 → KNOCKOUT', async () => {
  const { t, teamIds } = await setup();
  await playAllGroupMatches(teamIds);
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const status = (await testDb.tournament.findUnique({ where: { id: t.id } }))!.status;
  expect(status).toBe('KNOCKOUT');

  // A 组 = teamIds[0..3]（0 全胜 → A1, 1 → A2）；B 组 = teamIds[4..7]
  const sfs = await testDb.match.findMany({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } });
  const pairs = sfs.map((m) => [m.teamAId, m.teamBId]);
  // 交叉：A1–B2 与 B1–A2
  expect(pairs).toContainEqual([teamIds[0], teamIds[5]]);
  expect(pairs).toContainEqual([teamIds[4], teamIds[1]]);
});
