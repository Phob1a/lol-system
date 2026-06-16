import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { closeGroupStage } from './bracket-service';
import { cancelMatch, deleteGame, recordGame, setWalkover } from './score-service';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);

it('BO1 录一局即完赛，winner 物化', async () => {
  await setupGroupStage();
  const match = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await recordGame(testDb, {
    matchId: match.id, expectedVersion: 0,
    winnerTeamId: match.teamAId!, actorUserId: 'u',
  });
  const after = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  expect(after.status).toBe('FINISHED');
  expect(after.winnerTeamId).toBe(match.teamAId);
  expect(after.version).toBe(1);
});

it('版本不匹配 → VERSION_CONFLICT', async () => {
  await setupGroupStage();
  const match = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await expect(
    recordGame(testDb, { matchId: match.id, expectedVersion: 99, winnerTeamId: match.teamAId!, actorUserId: 'u' }),
  ).rejects.toThrow(/VERSION_CONFLICT/);
});

it('删局跌破阈值 → Match 回退 SCHEDULED、winner 清空', async () => {
  await setupGroupStage();
  const match = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await recordGame(testDb, { matchId: match.id, expectedVersion: 0, winnerTeamId: match.teamAId!, actorUserId: 'u' });
  const game = (await testDb.game.findFirst({ where: { matchId: match.id } }))!;
  await deleteGame(testDb, { matchId: match.id, gameId: game.id, expectedVersion: 1, actorUserId: 'u' });
  const after = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  expect(after.status).toBe('SCHEDULED');
  expect(after.winnerTeamId).toBeNull();
});

it('淘汰赛 BO3 两胜结算并沿 WINNER 边填入下一场；下游已录则拒绝改判', async () => {
  const { t, teamIds } = await setupGroupStage();
  // 把 12 场小组赛全录完：固定让全局下标小的队赢 → 名次 = 下标顺序
  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort(
      (a, b) => teamIds.indexOf(a) - teamIds.indexOf(b),
    )[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const sf = (await testDb.match.findFirst({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } }))!;
  expect(sf.teamAId).not.toBeNull();
  expect(sf.teamBId).not.toBeNull();

  // BO3：录两局同队胜 → FINISHED，FINAL 对应位被填
  await recordGame(testDb, { matchId: sf.id, expectedVersion: sf.version, winnerTeamId: sf.teamAId!, actorUserId: 'u' });
  await recordGame(testDb, { matchId: sf.id, expectedVersion: sf.version + 1, winnerTeamId: sf.teamAId!, actorUserId: 'u' });
  const sfAfter = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
  expect(sfAfter.status).toBe('FINISHED');

  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  expect([final.teamAId, final.teamBId]).toContain(sf.teamAId);

  // 在 FINAL 录一局后，回头删 SF 的局 → 拒绝（下游已录）
  await recordGame(testDb, { matchId: final.id, expectedVersion: final.version, winnerTeamId: sf.teamAId!, actorUserId: 'u' });
  const sfGame = (await testDb.game.findFirst({ where: { matchId: sf.id } }))!;
  await expect(
    deleteGame(testDb, { matchId: sf.id, gameId: sfGame.id, expectedVersion: sfAfter.version, actorUserId: 'u' }),
  ).rejects.toThrow(/DOWNSTREAM_RECORDED/);
});

it('walkover：计胜负、无 Game、status=WALKOVER', async () => {
  await setupGroupStage();
  const match = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await setWalkover(testDb, { matchId: match.id, expectedVersion: 0, winnerTeamId: match.teamBId!, actorUserId: 'u' });
  const after = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  expect(after.status).toBe('WALKOVER');
  expect(after.winnerTeamId).toBe(match.teamBId);
  expect(await testDb.game.count({ where: { matchId: match.id } })).toBe(0);
});

it('并发 CAS：相同 expectedVersion 同时提交，恰好一个成功一个 VERSION_CONFLICT，最终只有 1 局', async () => {
  await setupGroupStage();
  const match = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  const results = await Promise.allSettled([
    recordGame(testDb, { matchId: match.id, expectedVersion: 0, winnerTeamId: match.teamAId!, actorUserId: 'u' }),
    recordGame(testDb, { matchId: match.id, expectedVersion: 0, winnerTeamId: match.teamAId!, actorUserId: 'u' }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ message: expect.stringMatching(/VERSION_CONFLICT/) });
  expect(await testDb.game.count({ where: { matchId: match.id } })).toBe(1);
});

it('walkover 下游保护：SF walkover 后 FINAL 已有局，再次 walkover SF（换胜者）→ DOWNSTREAM_RECORDED', async () => {
  const { t, teamIds } = await setupGroupStage();
  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort(
      (a, b) => teamIds.indexOf(a) - teamIds.indexOf(b),
    )[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const sf = (await testDb.match.findFirst({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } }))!;
  // setWalkover SF with teamA winning
  await setWalkover(testDb, { matchId: sf.id, expectedVersion: sf.version, winnerTeamId: sf.teamAId!, actorUserId: 'u' });

  // Record a game in FINAL (downstream of SF)
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  await recordGame(testDb, { matchId: final.id, expectedVersion: final.version, winnerTeamId: sf.teamAId!, actorUserId: 'u' });

  // Try to setWalkover SF again (fresh version) with the OTHER team → DOWNSTREAM_RECORDED
  const sfAfter = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
  await expect(
    setWalkover(testDb, { matchId: sf.id, expectedVersion: sfAfter.version, winnerTeamId: sf.teamBId!, actorUserId: 'u' }),
  ).rejects.toThrow(/DOWNSTREAM_RECORDED/);
});

it('deleteGame 跨比赛校验：用比赛 A 的 id 删比赛 B 的局 → 拒绝，B 的局仍存在', async () => {
  await setupGroupStage();
  const matches = await testDb.match.findMany({ where: { groupId: { not: null } }, take: 2 });
  const [matchA, matchB] = matches;

  // Record a game on each match
  await recordGame(testDb, { matchId: matchA.id, expectedVersion: 0, winnerTeamId: matchA.teamAId!, actorUserId: 'u' });
  await recordGame(testDb, { matchId: matchB.id, expectedVersion: 0, winnerTeamId: matchB.teamAId!, actorUserId: 'u' });

  const gameB = (await testDb.game.findFirst({ where: { matchId: matchB.id } }))!;
  const matchAFresh = (await testDb.match.findUnique({ where: { id: matchA.id } }))!;

  // Attempt to delete match B's game using match A's id
  await expect(
    deleteGame(testDb, { matchId: matchA.id, gameId: gameB.id, expectedVersion: matchAFresh.version, actorUserId: 'u' }),
  ).rejects.toThrow(/该局不属于此比赛/);

  // Match B's game must still exist and match B's materialized state must be unchanged
  expect(await testDb.game.findUnique({ where: { id: gameB.id } })).not.toBeNull();
  const matchBAfter = (await testDb.match.findUnique({ where: { id: matchB.id } }))!;
  expect(matchBAfter.status).toBe('FINISHED');
  expect(matchBAfter.winnerTeamId).toBe(matchB.teamAId);
});

/** setupGroupStage → 录满小组赛 → closeGroupStage → 录完 SF，使 FINAL 双方就位但未开打。返回 { t, final }。 */
async function toFinalReady() {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let fresh = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(fresh.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, { matchId: sf.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u' });
      fresh = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  return { t, final };
}

it('决赛录满 → tournament FINISHED', async () => {
  const { t, final } = await toFinalReady();
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');
  let fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  const need = Math.ceil(fresh.bestOf / 2);
  for (let w = 0; w < need; w++) {
    await recordGame(testDb, { matchId: final.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u' });
    fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  }
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('FINISHED');
});

it('删决赛局跌破阈值 → 回退 KNOCKOUT', async () => {
  const { t, final } = await toFinalReady();
  let fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  const need = Math.ceil(fresh.bestOf / 2);
  for (let w = 0; w < need; w++) {
    await recordGame(testDb, { matchId: final.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u' });
    fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  }
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('FINISHED');
  const lastGame = (await testDb.game.findFirst({ where: { matchId: final.id }, orderBy: { index: 'desc' } }))!;
  await deleteGame(testDb, { matchId: final.id, gameId: lastGame.id, expectedVersion: fresh.version, actorUserId: 'u' });
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');
});

it('决赛 setWalkover → FINISHED；cancelMatch → 回退 KNOCKOUT', async () => {
  const { t, final } = await toFinalReady();
  const fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await setWalkover(testDb, { matchId: final.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u' });
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('FINISHED');
  const after = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await cancelMatch(testDb, { matchId: final.id, expectedVersion: after.version, actorUserId: 'u' });
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');
});

it('非决赛完赛（小组赛）不触发 FINISHED', async () => {
  const { t } = await setupGroupStage();
  const gm = (await testDb.match.findFirst({ where: { groupId: { not: null } } }))!;
  await recordGame(testDb, { matchId: gm.id, expectedVersion: gm.version, winnerTeamId: gm.teamAId!, actorUserId: 'u' });
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('GROUP_STAGE');
});
