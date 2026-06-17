import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { buildAutoMapping, buildMapping } from './import-service';
import { setupGroupStage } from './score-service.test-helpers';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import sample from '@/lib/test/fixtures/sample-summary.json';

beforeEach(resetDb);

// Extract from sample: teamId 100 (blue side)
const SAMPLE_BLUE = sample.players.filter((p) => p.teamId === 100).map((p) => p.name);
// Extract from sample: teamId 200 (red side)
const SAMPLE_RED = sample.players.filter((p) => p.teamId === 200).map((p) => p.name);

/** 推进到决赛双方就位（不开打）。使用 setupGroupStage → SF → FINAL。 */
async function toFinal() {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort(
      (a, b) => teamIds.indexOf(a) - teamIds.indexOf(b),
    )[0];
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, {
      matchId: gm.id,
      expectedVersion: f.version,
      winnerTeamId: winner,
      actorUserId: 'u',
    });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, {
        matchId: sf.id,
        expectedVersion: f.version,
        winnerTeamId: f.teamAId!,
        actorUserId: 'u',
      });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  return { t, final };
}

/**
 * 为指定 tournamentTeam 重建若干 TournamentTeamPlayer 行，每人的 Player.gameId 对应 names[i]。
 * 先清除已有的 tournamentTeamPlayer，再逐一创建 Player + Registration + TournamentTeamPlayer。
 * 返回每行的 registrationId（顺序与 names 一致）。
 */
async function seedRosterWithGameIds(
  tournamentId: string,
  teamId: string,
  names: string[],
): Promise<string[]> {
  const tt = (await testDb.tournamentTeam.findFirst({ where: { tournamentId, teamId } }))!;
  // 清除已有快照行
  await testDb.tournamentTeamPlayer.deleteMany({ where: { tournamentTeamId: tt.id } });

  const regIds: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const player = await testDb.player.create({
      data: { gameId: names[i], nickname: `选手${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        tournamentId,
        playerId: player.id,
        nickname: `选手${i}`,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        currentRank: 'GOLD',
        peakRank: 'PLATINUM',
        cost: 100,
        status: 'ACTIVE',
      },
    });
    await testDb.tournamentTeamPlayer.create({
      data: { tournamentTeamId: tt.id, registrationId: reg.id },
    });
    regIds.push(reg.id);
  }
  return regIds;
}

it('全 10 名自动匹配（gameId 与 capturedName 完全一致）', async () => {
  const { t, final } = await toFinal();
  await seedRosterWithGameIds(t.id, final.teamAId!, SAMPLE_BLUE);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED);

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);
  expect(result.rows).toHaveLength(10);
  for (const row of result.rows) {
    expect(row.registrationId).not.toBeNull();
  }
});

it('每行 siteTeamId 与 lcuTeamId 对应正确（100→blue，200→red）', async () => {
  const { t, final } = await toFinal();
  await seedRosterWithGameIds(t.id, final.teamAId!, SAMPLE_BLUE);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED);

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);
  for (const row of result.rows) {
    if (row.lcuTeamId === 100) {
      expect(row.siteTeamId).toBe(final.teamAId);
    } else {
      expect(row.siteTeamId).toBe(final.teamBId);
    }
  }
});

it('大小写 / 空白不敏感：gameId 大写变体仍能匹配', async () => {
  const { t, final } = await toFinal();
  // 把第一个蓝方 gameId 改成大写
  const blueNamesUpperFirst = [SAMPLE_BLUE[0].toUpperCase(), ...SAMPLE_BLUE.slice(1)];
  await seedRosterWithGameIds(t.id, final.teamAId!, blueNamesUpperFirst);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED);

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);
  const firstBlueRow = result.rows.find((r) => r.capturedName === SAMPLE_BLUE[0])!;
  expect(firstBlueRow.registrationId).not.toBeNull();
});

it('找不到匹配时 registrationId=null 但 candidates 仍有该侧名单', async () => {
  const { t, final } = await toFinal();
  // 蓝方只放 4 人（少一人），让第 5 蓝方 captured player 无匹配
  const blueNamesPartial = SAMPLE_BLUE.slice(0, 4);
  await seedRosterWithGameIds(t.id, final.teamAId!, blueNamesPartial);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED);

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);
  const unmatchedRow = result.rows.find((r) => r.capturedName === SAMPLE_BLUE[4])!;
  expect(unmatchedRow.registrationId).toBeNull();
  expect(unmatchedRow.candidates.length).toBe(4); // 只有 4 蓝方成员
});

it('侧隔离：蓝方捕获名称仅在红方名单出现时，registrationId=null（不跨边匹配）', async () => {
  const { t, final } = await toFinal();
  // 蓝方名单：使用与 sample 不同的 gameId（全换成哑名），导致蓝方 5 人全部无匹配
  const dummyBlue = SAMPLE_BLUE.map((_, i) => `dummy-blue-${i}`);
  // 红方名单：使用蓝方 captured 名称（SAMPLE_BLUE），模拟"红方恰好有与蓝方名字相同的人"
  // 由于 Player.gameId 全局唯一，这里让红方使用 SAMPLE_BLUE 作 gameId
  await seedRosterWithGameIds(t.id, final.teamAId!, dummyBlue);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_BLUE); // 红方持有蓝方名字

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);

  // 所有蓝方捕获（lcuTeamId=100）的 registrationId 必须为 null（因为蓝方名单里没有匹配）
  const blueRows = result.rows.filter((r) => r.lcuTeamId === 100);
  expect(blueRows).toHaveLength(5);
  for (const row of blueRows) {
    expect(row.registrationId).toBeNull(); // 没有跨到红方名单
    // candidates 应该是蓝方 dummy 名单
    expect(row.candidates.every((c) => c.gameId.startsWith('dummy-blue-'))).toBe(true);
  }

  // 同时确认红方捕获（lcuTeamId=200）能正确匹配到红方注册（红方 gameId=SAMPLE_RED）
  // 但红方名单此时是 SAMPLE_BLUE，所以红方 captured(SAMPLE_RED) 也无匹配 — 这不影响断言
  // 核心：蓝方行的 candidates 只有蓝方成员，不包含红方成员
  const redTeamTt = (await testDb.tournamentTeam.findFirst({
    where: { tournamentId: t.id, teamId: final.teamBId! },
  }))!;
  const redTeamPlayers = await testDb.tournamentTeamPlayer.findMany({
    where: { tournamentTeamId: redTeamTt.id },
  });
  const redRegIds = new Set(redTeamPlayers.map((p) => p.registrationId));

  for (const row of blueRows) {
    // 蓝方行的 candidates 不含任何红方注册 id
    for (const c of row.candidates) {
      expect(redRegIds.has(c.registrationId)).toBe(false);
    }
  }
});

it('blueTeamId 不属于 match → 抛错', async () => {
  const { final } = await toFinal();
  await expect(buildMapping(testDb, final.id, 'not-a-team', sample)).rejects.toThrow(
    /blueTeamId/,
  );
});

it('返回 matchId / blueTeamId / redTeamId 字段正确', async () => {
  const { t, final } = await toFinal();
  await seedRosterWithGameIds(t.id, final.teamAId!, SAMPLE_BLUE);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED);

  const result = await buildMapping(testDb, final.id, final.teamAId!, sample);
  expect(result.matchId).toBe(final.id);
  expect(result.blueTeamId).toBe(final.teamAId);
  expect(result.redTeamId).toBe(final.teamBId);
});

it('buildAutoMapping 按选手命中结果自动判断 LCU 蓝方对应的站内队伍', async () => {
  const { t, final } = await toFinal();
  await seedRosterWithGameIds(t.id, final.teamAId!, SAMPLE_RED);
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_BLUE);

  const result = await buildAutoMapping(testDb, final.id, sample);
  expect(result.blueTeamId).toBe(final.teamBId);
  expect(result.redTeamId).toBe(final.teamAId);
  expect(result.rows.every((r) => r.registrationId !== null)).toBe(true);
});

it('buildAutoMapping 两种红蓝分配命中数相同时默认 teamA=蓝方，不阻断审核', async () => {
  const { t, final } = await toFinal();
  await seedRosterWithGameIds(t.id, final.teamAId!, SAMPLE_BLUE.map((_, i) => `a-${i}`));
  await seedRosterWithGameIds(t.id, final.teamBId!, SAMPLE_RED.map((_, i) => `b-${i}`));

  const result = await buildAutoMapping(testDb, final.id, sample);
  expect(result.blueTeamId).toBe(final.teamAId);
  expect(result.redTeamId).toBe(final.teamBId);
  expect(result.rows.every((r) => r.registrationId === null)).toBe(true);
});
