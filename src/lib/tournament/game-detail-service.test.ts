import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { saveGameDetail } from './game-detail-service';
import { getChampions } from './champions';
import { expandRosterTo5 } from './test-fixtures';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);
const CH = (i: number) => C[i % C.length];

/** 推进到 FINAL 双方就位、未开打。返回 { t, final }。 */
async function toFinalWithRosters() {
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

function statsFor(teamId: string, regIds: string[], off = 0) {
  return regIds.map((registrationId, k) => ({
    teamId, registrationId, championId: CH(k + off),
    kills: 1, deaths: 1, assists: 1, cs: 100, damage: 1000, gold: 500,
  }));
}
function bansFor(teamAId: string, teamBId: string) {
  return [
    { teamId: teamAId, type: 'BAN' as const, championId: CH(20), order: 1 },
    { teamId: teamBId, type: 'BAN' as const, championId: CH(21), order: 2 },
    { teamId: teamAId, type: 'PICK' as const, championId: CH(22), order: 3 },
    { teamId: teamBId, type: 'PICK' as const, championId: CH(23), order: 4 },
  ];
}

it('草稿建局（winnerTeamId=null）：isDraft=true、不结算、tournament 不 FINISHED', async () => {
  const { t, final } = await toFinalWithRosters();
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: null, blueTeamId: final.teamAId },
    actorUserId: 'u',
  });
  const game = (await testDb.game.findFirst({ where: { matchId: final.id } }))!;
  expect(game.isDraft).toBe(true);
  expect((await testDb.match.findUnique({ where: { id: final.id } }))!.status).toBe('SCHEDULED');
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');
});

it('转正（winnerTeamId 非空）：isDraft=false、结算计入、决赛 → FINISHED', async () => {
  const { t, final } = await toFinalWithRosters();
  let f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  for (let g = 0; g < 3; g++) {
    await saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: f.version,
      detail: { winnerTeamId: f.teamAId, blueTeamId: f.teamAId },
      actorUserId: 'u',
    });
    f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  }
  expect(f.status).toBe('FINISHED');
  expect(f.winnerTeamId).toBe(final.teamAId);
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('FINISHED');
});

it('编辑已转正局改 winner → 下游已录则拒绝（下游保护）', async () => {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const f0 = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: f0.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  const sf = (await testDb.match.findFirst({ where: { roundKey: 'SF' } }))!;
  let sfresh = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
  const need = Math.ceil(sfresh.bestOf / 2);
  for (let w = 0; w < need; w++) {
    await saveGameDetail(testDb, { matchId: sf.id, expectedVersion: sfresh.version, detail: { winnerTeamId: sfresh.teamAId! }, actorUserId: 'u' });
    sfresh = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
  }
  const gid = (await testDb.game.findFirst({ where: { matchId: sf.id }, orderBy: { index: 'desc' } }))!.id;
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  await recordGame(testDb, { matchId: final.id, expectedVersion: final.version, winnerTeamId: final.teamAId!, actorUserId: 'u' });
  await expect(
    saveGameDetail(testDb, { matchId: sf.id, gameId: gid, expectedVersion: sfresh.version, detail: { winnerTeamId: sfresh.teamBId! }, actorUserId: 'u' }),
  ).rejects.toThrow(/下游/);
});

it('BP order 不连续 → 拒绝', async () => {
  const { final } = await toFinalWithRosters();
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: {
        winnerTeamId: final.teamAId, blueTeamId: final.teamAId,
        bans: [
          { teamId: final.teamAId!, type: 'BAN', championId: CH(0), order: 1 },
          { teamId: final.teamBId!, type: 'BAN', championId: CH(1), order: 3 },
        ],
      },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/顺序|order|连续/);
});

it('BP championId 不在静态表 → 拒绝', async () => {
  const { final } = await toFinalWithRosters();
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, bans: [{ teamId: final.teamAId!, type: 'BAN', championId: '__nope__', order: 1 }] },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/英雄/);
});

it('stats 非 5+5 → 拒绝', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, playerStats: statsFor(final.teamAId!, a) },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/各 5|5 条|双方/);
});

it('stats registrationId 不在快照 → 拒绝', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const bad = [...statsFor(final.teamAId!, a, 0), ...statsFor(final.teamBId!, [...b.slice(0, 4), 'not-a-reg'], 5)];
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, playerStats: bad },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/快照|名单/);
});

it('完整 stats 5+5 + BP 写入成功且可设 MVP（MVP ∈ 10 人）', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamAId, blueTeamId: final.teamAId, durationSeconds: 1800,
      bans: bansFor(final.teamAId!, final.teamBId!),
      playerStats: [...statsFor(final.teamAId!, a, 0), ...statsFor(final.teamBId!, b, 5)],
      mvpRegistrationId: a[0],
    },
    actorUserId: 'u',
  });
  const game = (await testDb.game.findFirst({ where: { matchId: final.id }, include: { bans: true, playerStats: true } }))!;
  expect(game.playerStats).toHaveLength(10);
  expect(game.bans).toHaveLength(4);
  expect(game.mvpRegistrationId).toBe(a[0]);
  expect(game.durationSeconds).toBe(1800);
  expect(game.blueTeamId).toBe(final.teamAId);
});

it('MVP 不在 10 人 → 拒绝', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, playerStats: [...statsFor(final.teamAId!, a, 0), ...statsFor(final.teamBId!, b, 5)], mvpRegistrationId: 'outsider' },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/MVP|10 人/);
});

it('MVP 在 stats 不完整时 → 拒绝', async () => {
  const { final } = await toFinalWithRosters();
  await expect(
    saveGameDetail(testDb, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, mvpRegistrationId: 'anything' },
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/MVP|数据/);
});

it('快录补全：先快录(只 winner)，后补 BP（stats 传 undefined）不改结算', async () => {
  const { final } = await toFinalWithRosters();
  await saveGameDetail(testDb, { matchId: final.id, expectedVersion: final.version, detail: { winnerTeamId: final.teamAId }, actorUserId: 'u' });
  const g = (await testDb.game.findFirst({ where: { matchId: final.id } }))!;
  const f2 = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await saveGameDetail(testDb, {
    matchId: final.id, gameId: g.id, expectedVersion: f2.version,
    detail: { winnerTeamId: final.teamAId, bans: bansFor(final.teamAId!, final.teamBId!) },
    actorUserId: 'u',
  });
  const after = (await testDb.game.findUnique({ where: { id: g.id }, include: { bans: true, playerStats: true } }))!;
  expect(after.isDraft).toBe(false);
  expect(after.bans).toHaveLength(4);
  expect(after.winnerTeamId).toBe(final.teamAId);
});

it('三态 — undefined 保留 / null 清空 / value 替换（bans + scalar）', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamAId, blueTeamId: final.teamAId, durationSeconds: 1500,
      bans: bansFor(final.teamAId!, final.teamBId!),
      playerStats: [...statsFor(final.teamAId!, a, 0), ...statsFor(final.teamBId!, b, 5)],
      mvpRegistrationId: a[0],
    },
    actorUserId: 'u',
  });
  const g = (await testDb.game.findFirst({ where: { matchId: final.id } }))!;
  let f = (await testDb.match.findUnique({ where: { id: final.id } }))!;

  // undefined 保留：只改 durationSeconds
  await saveGameDetail(testDb, { matchId: final.id, gameId: g.id, expectedVersion: f.version, detail: { winnerTeamId: final.teamAId, durationSeconds: 1600 }, actorUserId: 'u' });
  let cur = (await testDb.game.findUnique({ where: { id: g.id }, include: { bans: true, playerStats: true } }))!;
  expect(cur.durationSeconds).toBe(1600);
  expect(cur.bans).toHaveLength(4);
  expect(cur.playerStats).toHaveLength(10);
  expect(cur.blueTeamId).toBe(final.teamAId);
  expect(cur.mvpRegistrationId).toBe(a[0]);

  // null 清空：blueTeamId / durationSeconds / bans
  f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await saveGameDetail(testDb, { matchId: final.id, gameId: g.id, expectedVersion: f.version, detail: { winnerTeamId: final.teamAId, blueTeamId: null, durationSeconds: null, bans: null }, actorUserId: 'u' });
  cur = (await testDb.game.findUnique({ where: { id: g.id }, include: { bans: true, playerStats: true } }))!;
  expect(cur.blueTeamId).toBeNull();
  expect(cur.durationSeconds).toBeNull();
  expect(cur.bans).toHaveLength(0);
  expect(cur.playerStats).toHaveLength(10);

  // null 清空 stats → 连带 mvp 清空
  f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await saveGameDetail(testDb, { matchId: final.id, gameId: g.id, expectedVersion: f.version, detail: { winnerTeamId: final.teamAId, playerStats: null }, actorUserId: 'u' });
  const cur3 = (await testDb.game.findUnique({ where: { id: g.id }, include: { playerStats: true } }))!;
  expect(cur3.playerStats).toHaveLength(0);
  expect(cur3.mvpRegistrationId).toBeNull();
});

it('已转正局传 winnerTeamId=null → 拒绝（清胜负请删局）', async () => {
  const { final } = await toFinalWithRosters();
  await saveGameDetail(testDb, { matchId: final.id, expectedVersion: final.version, detail: { winnerTeamId: final.teamAId }, actorUserId: 'u' });
  const g = (await testDb.game.findFirst({ where: { matchId: final.id } }))!;
  const f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await expect(
    saveGameDetail(testDb, { matchId: final.id, gameId: g.id, expectedVersion: f.version, detail: { winnerTeamId: null }, actorUserId: 'u' }),
  ).rejects.toThrow(/草稿|删局|胜负/);
});

it('CAS：错误 expectedVersion → VERSION_CONFLICT', async () => {
  const { final } = await toFinalWithRosters();
  await expect(
    saveGameDetail(testDb, { matchId: final.id, expectedVersion: final.version + 99, detail: { winnerTeamId: final.teamAId }, actorUserId: 'u' }),
  ).rejects.toThrow(/VERSION_CONFLICT|刷新/);
});

it('归档赛季 → 拒绝', async () => {
  const { t, final } = await toFinalWithRosters();
  await testDb.season.update({ where: { id: t.seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  await expect(
    saveGameDetail(testDb, { matchId: final.id, expectedVersion: final.version, detail: { winnerTeamId: final.teamAId }, actorUserId: 'u' }),
  ).rejects.toThrow(/归档/);
});

it('CANCELED/WALKOVER 比赛 → 拒绝', async () => {
  const { final } = await toFinalWithRosters();
  await testDb.match.update({ where: { id: final.id }, data: { status: 'WALKOVER' } });
  const f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  await expect(
    saveGameDetail(testDb, { matchId: final.id, expectedVersion: f.version, detail: { winnerTeamId: final.teamAId }, actorUserId: 'u' }),
  ).rejects.toThrow(/状态/);
});

it('新建局超 bestOf 上限 → 拒绝', async () => {
  const { final } = await toFinalWithRosters();
  let f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  for (let i = 0; i < 5; i++) {
    await saveGameDetail(testDb, { matchId: final.id, expectedVersion: f.version, detail: { winnerTeamId: null }, actorUserId: 'u' });
    f = (await testDb.match.findUnique({ where: { id: final.id } }))!;
  }
  await expect(
    saveGameDetail(testDb, { matchId: final.id, expectedVersion: f.version, detail: { winnerTeamId: null }, actorUserId: 'u' }),
  ).rejects.toThrow(/上限/);
});
