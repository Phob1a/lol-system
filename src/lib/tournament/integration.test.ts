import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { getPublicTournamentState } from './read-model';
import { seedTournamentWithTeams } from './test-fixtures';

beforeEach(resetDb);

it('全流程：建赛事(带配置) → 造队 → 分组 → 确认 → 录分 → 冠军', async () => {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  const t = (await testDb.tournament.findUnique({ where: { id: tournamentId } }))!;

  const groups = await testDb.tournamentGroup.findMany({ where: { stage: { tournamentId } }, orderBy: { name: 'asc' } });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });

  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  for (const roundKey of ['SF', 'FINAL']) {
    for (const m of await testDb.match.findMany({ where: { roundKey } })) {
      let fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      const need = Math.ceil(fresh.bestOf / 2);
      for (let w = 0; w < need; w++) {
        await recordGame(testDb, { matchId: m.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u' });
        fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      }
      expect(fresh.status).toBe('FINISHED');
    }
  }

  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  expect(final.winnerTeamId).toBe(final.teamAId);

  const state = (await getPublicTournamentState(testDb, t.id))!;
  expect(state.matches.length).toBe(12 + 3);
  expect(state.standings).toHaveLength(2);
  expect(state.bracket.map((r) => r.roundKey)).toEqual(['SF', 'FINAL']);
});
