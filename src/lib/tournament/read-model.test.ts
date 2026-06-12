import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { saveGameDetail } from './game-detail-service';
import { getPublicTournamentState, getAdminTournamentState, getPublicMatchDetail } from './read-model';
import { getChampions } from './champions';
import { expandRosterTo5 } from './test-fixtures';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

it('公开 state 不含 version/config，且 match projection 无 version', async () => {
  const { seasonId } = await setupGroupStage();
  const state = (await getPublicTournamentState(testDb, seasonId))!;
  expect((state.tournament as Record<string, unknown>).config).toBeUndefined();
  expect((state.tournament as Record<string, unknown>).version).toBeUndefined();
  for (const m of state.matches) expect((m as Record<string, unknown>).version).toBeUndefined();
});

it('admin state 含 config/version + games 摘要（isDraft/hasBans/hasStats）', async () => {
  const { seasonId } = await setupGroupStage();
  const gm = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await saveGameDetail(testDb, { matchId: gm.id, expectedVersion: gm.version, detail: { winnerTeamId: null }, actorUserId: 'u' });
  const admin = (await getAdminTournamentState(testDb, seasonId))!;
  expect((admin.tournament as Record<string, unknown>).config).toBeDefined();
  const row = admin.matches.find((m) => m.id === gm.id)!;
  expect(row.version).toBeGreaterThanOrEqual(0);
  expect(row.games[0].isDraft).toBe(true);
  expect(row.games[0].hasBans).toBe(false);
  expect(row.games[0].hasStats).toBe(false);
});

it('公开 match 详情：非草稿局完整明细 + playerId；草稿局不出现；非活跃赛季返回 null', async () => {
  const { t } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: f.version, winnerTeamId: gm.teamAId!, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  // advance SF matches so FINAL gets teams assigned
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, { matchId: sf.id, expectedVersion: f.version, winnerTeamId: f.teamAId!, actorUserId: 'u' });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const stats = (teamId: string, regs: string[], off: number) => regs.map((registrationId, k) => ({ teamId, registrationId, championId: C[(k + off) % C.length], kills: 1, deaths: 1, assists: 1, cs: 1, damage: 1, gold: 1 }));
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: final.teamAId, blueTeamId: final.teamAId, durationSeconds: 1800, bans: [{ teamId: final.teamAId!, type: 'BAN', championId: C[30], order: 1 }], playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)], mvpRegistrationId: a[0] },
    actorUserId: 'u',
  });
  const f2 = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await saveGameDetail(testDb, { matchId: final.id, expectedVersion: f2.version, detail: { winnerTeamId: null }, actorUserId: 'u' }); // 草稿局

  const detail = (await getPublicMatchDetail(testDb, final.id))!;
  expect(detail.games).toHaveLength(1); // 草稿局被过滤
  expect(detail.games[0].bans).toHaveLength(1);
  expect(detail.games[0].players).toHaveLength(10);
  expect(detail.games[0].players[0].playerId).toBeTruthy();
  expect(detail.games[0].players[0].nickname).toBeTruthy();
  expect(detail.games[0].players[0].championName).toBeTruthy();
  expect(detail.games[0].mvpRegistrationId).toBe(a[0]);

  await testDb.season.update({ where: { id: t.seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  expect(await getPublicMatchDetail(testDb, final.id)).toBeNull();
});
