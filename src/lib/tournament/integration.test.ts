import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { getPublicTournamentState } from './read-model';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

it('全流程：8 队 2 组出 4 强 → SF → FINAL → 冠军', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'S1', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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

  // 小组赛：下标小者胜
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  // 淘汰赛：teamA 全胜打满
  for (const roundKey of ['SF', 'FINAL']) {
    for (const m of await testDb.match.findMany({ where: { roundKey } })) {
      let fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      const need = Math.ceil(fresh.bestOf / 2);
      for (let w = 0; w < need; w++) {
        await recordGame(testDb, {
          matchId: m.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u',
        });
        fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      }
      expect(fresh.status).toBe('FINISHED');
    }
  }

  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  expect(final.winnerTeamId).toBe(final.teamAId);

  // 读模型完整性
  const state = (await getPublicTournamentState(testDb, seasonId))!;
  expect(state.matches.length).toBe(12 + 3);
  expect(state.standings).toHaveLength(2);
  expect(state.bracket.map((r) => r.roundKey)).toEqual(['SF', 'FINAL']);
});
