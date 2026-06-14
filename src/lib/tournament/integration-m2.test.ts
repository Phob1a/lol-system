import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { saveGameDetail } from './game-detail-service';
import { getPublicTournamentState, getPublicMatchDetail } from './read-model';
import { getPlayerSeasonStats } from './player-stats-service';
import { computeLeaderboard, type LeaderboardGame } from './leaderboard';
import { seedTournamentWithTeams, expandRosterTo5 } from './test-fixtures';
import { getChampions } from './champions';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

it('M2 全流程：建赛事→分组→快录+详细→决赛 FINISHED→数据榜/详情/选手页', async () => {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  const t = (await testDb.tournament.findUnique({ where: { id: tournamentId } }))!;
  const groups = await testDb.tournamentGroup.findMany({ where: { stage: { tournamentId } }, orderBy: { name: 'asc' } });
  await assignGroups(testDb, { tournamentId: t.id, assignments: [{ groupId: groups[0].id, teamIds: teamIds.slice(0, 4) }, { groupId: groups[1].id, teamIds: teamIds.slice(4) }], actorUserId: 'u' });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });

  // 小组赛：快录
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: f.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  // SF：快录
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, { matchId: sf.id, expectedVersion: f.version, winnerTeamId: f.teamAId!, actorUserId: 'u' });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }

  // FINAL：详细录入（BP + 10 人 + MVP）至 3 胜
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const stats = (teamId: string, regs: string[], off: number) => regs.map((registrationId, k) => ({ teamId, registrationId, championId: C[(k + off) % C.length], kills: 5, deaths: 2, assists: 7, cs: 200, damage: 20000, gold: 13000 }));
  let f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  for (let g = 0; g < 3; g++) {
    await saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: f.version,
      detail: { winnerTeamId: final.teamAId, blueTeamId: g % 2 === 0 ? final.teamAId : final.teamBId, durationSeconds: 1800, bans: [{ teamId: final.teamAId!, type: 'BAN', championId: C[40 + g], order: 1 }], playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)], mvpRegistrationId: a[0] },
      actorUserId: 'u',
    });
    f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  }
  expect(f.status).toBe('FINISHED');
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('FINISHED');

  // 公开 state：无 config
  const state = (await getPublicTournamentState(testDb, t.id))!;
  expect((state.tournament as Record<string, unknown>).config).toBeUndefined();

  // 比赛详情：FINAL 3 局完整明细
  const detail = (await getPublicMatchDetail(testDb, final.id))!;
  expect(detail.games).toHaveLength(3);
  expect(detail.games[0].players).toHaveLength(10);
  expect(detail.games[0].players[0].playerId).toBeTruthy();

  // 数据榜：a[0] 3 场 3 胜 3 MVP
  const games = await testDb.game.findMany({ where: { isDraft: false, match: { tournamentId: t.id } }, include: { playerStats: { include: { registration: { select: { playerId: true } } } } } });
  const lb = computeLeaderboard(games.map((g): LeaderboardGame => ({ isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, mvpRegistrationId: g.mvpRegistrationId, playerStats: g.playerStats.map((s) => ({ registrationId: s.registrationId, playerId: s.registration.playerId, teamId: s.teamId, championId: s.championId, kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold })) })));
  const lbRow = lb.find((r) => r.registrationId === a[0])!;
  expect(lbRow.games).toBe(3);
  expect(lbRow.wins).toBe(3);
  expect(lbRow.mvpCount).toBe(3);

  // 选手页
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const ps = (await getPlayerSeasonStats(testDb, reg.playerId, t.id))!;
  expect(ps.summary.games).toBe(3);
  expect(ps.summary.mvpCount).toBe(3);
  expect(ps.games).toHaveLength(3);
  expect(ps.games.every((r) => r.isMvp)).toBe(true);
});
