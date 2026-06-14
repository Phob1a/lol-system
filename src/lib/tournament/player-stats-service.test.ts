import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { saveGameDetail } from './game-detail-service';
import { getPlayerTournamentStats } from './player-stats-service';
import { getChampions } from './champions';
import { expandRosterTo5, seedTournamentWithTeams } from './test-fixtures';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

async function finalWithRosters() {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: f.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, { matchId: sf.id, expectedVersion: f.version, winnerTeamId: f.teamAId!, actorUserId: 'u' });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  return { t, final };
}

const stats = (teamId: string, regs: string[], off: number) =>
  regs.map((registrationId, k) => ({ teamId, registrationId, championId: C[(k + off) % C.length], kills: 3, deaths: 1, assists: 2, cs: 180, damage: 15000, gold: 11000 }));

it('汇总 + 逐场明细；MVP 标记', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: final.teamAId, playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)], mvpRegistrationId: a[0] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;
  expect(res.summary.games).toBe(1);
  expect(res.summary.mvpCount).toBe(1);
  expect(res.games).toHaveLength(1);
  expect(res.games[0].isMvp).toBe(true);
  expect(res.games[0].kills).toBe(3);
  expect(typeof res.games[0].matchLabel).toBe('string');
  expect(res.games[0].opponent).toBeTruthy();
  expect(res.games[0].championId).toBeTruthy();
});

it('跨赛事隔离：仅取指定赛事的数据（真实第二赛事，验证 match.tournamentId 过滤）', async () => {
  // Tournament #1: seed a FINAL with game stats for player a[0]
  const { t: t1, final: final1 } = await finalWithRosters();
  const a = await expandRosterTo5(t1.id, final1.teamAId!);
  const b = await expandRosterTo5(t1.id, final1.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final1.id, expectedVersion: final1.version,
    detail: { winnerTeamId: final1.teamAId, playerStats: [...stats(final1.teamAId!, a, 0), ...stats(final1.teamBId!, b, 5)] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  // Verify player has 1 game in tournament #1
  const res1 = (await getPlayerTournamentStats(testDb, reg.playerId, t1.id))!;
  expect(res1.summary.games).toBe(1);

  // Tournament #2: a real second tournament; register the SAME player to bypass the early-return path
  // so that getPlayerTournamentStats actually runs the match.tournamentId filter query
  const { tournamentId: t2Id } = await seedTournamentWithTeams(4);
  await testDb.registration.create({
    data: {
      tournamentId: t2Id, playerId: reg.playerId, nickname: reg.nickname,
      primaryPositions: ['MID'], secondaryPositions: [],
      currentRank: 'GOLD', peakRank: 'PLATINUM', cost: 100,
      status: 'ACTIVE', isCaptain: false,
    },
  });

  // Querying tournament #2 must return 0 games — the player has a registration in t2
  // but no game stats; the match.tournamentId filter must not bleed t1 stats through
  const res2 = (await getPlayerTournamentStats(testDb, reg.playerId, t2Id))!;
  expect(res2.summary.games).toBe(0);
});
