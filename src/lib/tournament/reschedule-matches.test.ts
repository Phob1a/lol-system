import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { rescheduleMatches } from './score-service';
import { setupGroupStage } from './score-service.test-helpers';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';
import { assignGroups, confirmGroups } from './groups-service';

beforeEach(resetDb);

const T0 = new Date('2026-07-01T10:00:00.000Z');
const T1 = new Date('2026-07-01T12:30:00.000Z');

/** 取当前 GROUP_STAGE 赛事的小组赛 match（含 version）。 */
async function groupMatches() {
  return testDb.match.findMany({ where: { groupId: { not: null } }, orderBy: { id: 'asc' } });
}

it('批量设时间成功（含 null 清空回未排期）', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  // 先全设时间
  await rescheduleMatches(testDb, {
    items: ms.map((m) => ({ matchId: m.id, expectedVersion: m.version, scheduledAt: T0 })),
    actorUserId: 'u',
  });
  for (const m of ms) {
    const fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
    expect(fresh.scheduledAt?.toISOString()).toBe(T0.toISOString());
    expect(fresh.version).toBe(m.version + 1); // version +1
  }
  // 再把第一场清空（null → 未排期）
  const first = (await testDb.match.findUnique({ where: { id: ms[0].id } }))!;
  await rescheduleMatches(testDb, {
    items: [{ matchId: first.id, expectedVersion: first.version, scheduledAt: null }],
    actorUserId: 'u',
  });
  expect((await testDb.match.findUnique({ where: { id: ms[0].id } }))!.scheduledAt).toBeNull();
});

it('某项 version 冲突 → 整体回滚（其余 item 时间不变）', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  const items = ms.slice(0, 3).map((m) => ({ matchId: m.id, expectedVersion: m.version, scheduledAt: T1 }));
  items[1].expectedVersion = items[1].expectedVersion + 99; // 第二项故意打错版本
  await expect(rescheduleMatches(testDb, { items, actorUserId: 'u' })).rejects.toThrow(/VERSION_CONFLICT|刷新/);
  // 全回滚：三项 scheduledAt 都仍为 null
  for (const m of ms.slice(0, 3)) {
    expect((await testDb.match.findUnique({ where: { id: m.id } }))!.scheduledAt).toBeNull();
  }
});

it('异赛事 matchId 混入 → VALIDATION 拒绝且无写入', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  // 第二个赛季 + 赛事（分组确认以生成小组赛 match）
  const { seasonId: s2, teamIds: tids2 } = await seedSeasonWithTeams(8);
  const t2 = await createTestTournament(testDb, { seasonId: s2, teamIds: tids2, config: CFG_2x4x2, actorUserId: 'u' });
  const groups2 = await testDb.tournamentGroup.findMany({ where: { stage: { tournamentId: t2.id } }, orderBy: { name: 'asc' } });
  await assignGroups(testDb, {
    tournamentId: t2.id,
    assignments: [
      { groupId: groups2[0].id, teamIds: tids2.slice(0, 4) },
      { groupId: groups2[1].id, teamIds: tids2.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t2.id, actorUserId: 'u' });
  const foreign = (await testDb.match.findFirst({ where: { tournamentId: t2.id, groupId: { not: null } } }))!;

  const items = [
    { matchId: ms[0].id, expectedVersion: ms[0].version, scheduledAt: T0 },
    { matchId: foreign.id, expectedVersion: foreign.version, scheduledAt: T0 },
  ];
  await expect(rescheduleMatches(testDb, { items, actorUserId: 'u' })).rejects.toThrow(/同一赛事|赛事/);
  // 无写入：本赛事那场仍 null
  expect((await testDb.match.findUnique({ where: { id: ms[0].id } }))!.scheduledAt).toBeNull();
});

it('重复 matchId → VALIDATION 拒绝（codex P2）', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  const items = [
    { matchId: ms[0].id, expectedVersion: ms[0].version, scheduledAt: T0 },
    { matchId: ms[0].id, expectedVersion: ms[0].version, scheduledAt: T1 },
  ];
  await expect(rescheduleMatches(testDb, { items, actorUserId: 'u' })).rejects.toThrow(/重复/);
});

it('空数组 → VALIDATION', async () => {
  await setupGroupStage();
  await expect(rescheduleMatches(testDb, { items: [], actorUserId: 'u' })).rejects.toThrow(/不能为空|为空/);
});

it('超 200 项 → VALIDATION', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  const items = Array.from({ length: 201 }, (_, i) => ({
    matchId: ms[i % ms.length].id, expectedVersion: 0, scheduledAt: T0,
  }));
  await expect(rescheduleMatches(testDb, { items, actorUserId: 'u' })).rejects.toThrow(/200|过多/);
});

it('缺失 matchId → MATCH_NOT_FOUND', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  const items = [
    { matchId: ms[0].id, expectedVersion: ms[0].version, scheduledAt: T0 },
    { matchId: 'no-such-match', expectedVersion: 0, scheduledAt: T0 },
  ];
  await expect(rescheduleMatches(testDb, { items, actorUserId: 'u' })).rejects.toThrow(/不存在|MATCH_NOT_FOUND/);
  expect((await testDb.match.findUnique({ where: { id: ms[0].id } }))!.scheduledAt).toBeNull();
});

it('归档赛季 → 拒绝（INVALID_STATE，双条件语义）', async () => {
  const { t } = await setupGroupStage();
  const ms = await groupMatches();
  // 只设 status=ARCHIVED（archivedAt 仍为 null）也必须被拦——验证用的是双条件而非 archivedAt-only
  await testDb.season.update({ where: { id: t.seasonId }, data: { status: 'ARCHIVED' } });
  await expect(
    rescheduleMatches(testDb, {
      items: [{ matchId: ms[0].id, expectedVersion: ms[0].version, scheduledAt: T0 }],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/归档/);
});

it('成功写入一条 audit（action=match.schedule.batch, count）', async () => {
  await setupGroupStage();
  const ms = await groupMatches();
  await rescheduleMatches(testDb, {
    items: ms.slice(0, 2).map((m) => ({ matchId: m.id, expectedVersion: m.version, scheduledAt: T0 })),
    actorUserId: 'actor-1',
  });
  const logs = await testDb.auditLog.findMany({ where: { action: 'match.schedule.batch' } });
  expect(logs).toHaveLength(1);
  expect((logs[0].payload as { count: number }).count).toBe(2);
});
