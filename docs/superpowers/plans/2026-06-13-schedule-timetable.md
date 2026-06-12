# 赛程时间表 实施计划 — 拖拽排期面板 + 公开时间线

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地「赛程时间表」（spec：`docs/superpowers/specs/2026-06-13-schedule-timetable-design.md` rev.2，codex-PASSED）：A 管理侧拖拽排期面板 + B 公开侧时间线视图。后端新增批量改期服务 `rescheduleMatches`（全部校验与写入在同一事务内，all-or-nothing，乐观锁逐项 CAS）+ 批量端点 `POST /api/tournament/admin/schedule/batch`；前端抽出可测纯函数 `groupMatchesByDay`（公开时间线）与排期面板纯逻辑（未排期池 / 按天分栏 / 并行计数 / 自动顺排），自研轻量 `SchedulePlanner`（桌面 HTML5 拖拽 + 移动端点击编辑降级，无第三方日历库）；公开 `ScheduleList` 增强为按天分组时间线（日期+星期+「N 场」，时间待定置底）。**零 schema 变更零迁移**（`Match.scheduledAt DateTime?` 早已存在）。

**Architecture:** 沿用现有 CRUD + 派生计算 + 轻量审计模式。批量改期服务进 `score-service.ts`（与单场 `rescheduleMatch` 同文件），复用 `assertSeasonWritable` 守卫语义、`writeAudit`、`TournamentError`、乐观锁 `updateMany WHERE id+version`（与 `claimMatch` 同模式）。不触碰结算（reschedule 只改 `scheduledAt` + `version` increment，不调 `resettleMatch`）。纯展示/排序逻辑抽到 `src/lib/tournament/schedule-grouping.ts`（unit 可测），UI 组件消费纯函数。批量端点镜像现有 `matches/[id]` PATCH op=reschedule 的 `requireAdmin` + Zod + `publishTournament` + `toResponse` 兜底模式。

**Tech Stack:** Next.js 15 App Router、Prisma 5 + PostgreSQL 16、Zod、vitest（unit 项目定义于 `vitest.workspace.ts`，DB 集成测试基建已存在；unit `include: ['src/lib/**/*.test.ts']`——故纯函数测试文件必须置于 `src/lib/**`）、SSE（已上线，独立 tournament-bus，只广播失效信号）、Playwright（E2E，baseURL `http://localhost:3103`）。

**范围外**（spec §6）：倒计时 / 「进行中」实时高亮 / 「今日」定位（下一迭代，本期留好结构）；直播链接、日历订阅（iCal）、冲突自动检测/避让；周历网格形态（形态二，已否决）。

**约定**：所有命令在仓库根执行。测试命令 `npx vitest run <file> --project unit`（unit 项目定义于 `vitest.workspace.ts`，已核实）；全量回归 `npx vitest run`。每个 Task 结束必须 commit（前缀 `feat(tournament)` / `test` / `chore`）。现有模式参考文件：DB service `src/lib/tournament/score-service.ts`（`rescheduleMatch` 单场 / `claimMatch` CAS）；守卫 `src/lib/tournament/guards.ts`（`assertSeasonWritable` / `assertSeasonWritableBySeasonId` 双条件 `status==='ARCHIVED' || archivedAt!==null`）；错误类 `src/lib/tournament/errors.ts`（`TournamentError(code, msg)`，code 含 `VERSION_CONFLICT`/`VALIDATION`/`INVALID_STATE`/`MATCH_NOT_FOUND`）；错误→HTTP `src/lib/tournament/route-errors.ts`（`toResponse`，`VERSION_CONFLICT→409`/`VALIDATION→422`/`INVALID_STATE→422`/`MATCH_NOT_FOUND→404`）；审计 `src/lib/tournament/audit.ts`（`writeAudit(tx, {...})`）；测试 DB `src/lib/test/db.ts`（`resetDb`/`testDb`）；夹具 `src/lib/tournament/test-fixtures.ts`（`createTestTournament`/`seedTeamsForSeason`/`seedSeasonWithTeams`/`CFG_2x4x2`）；测试 setup helper `src/lib/tournament/score-service.test-helpers.ts`（`setupGroupStage`）；路由守卫 `src/lib/api-guards.ts`（`requireAdmin()` → `{error}` 或 `{session}`，`guard.session.user.id`）；SSE `src/server/tournament-bus.ts`（`publishTournament({ type:'tournament.invalidated' })`）；UI kit `src/components/ui/*`（Dialog/Select/Table/Tabs/Badge/Input/Button/Label/Card/Checkbox；**无 popover.tsx，无 command.tsx**——时间选择用 **Dialog**）；datetime 互转 helper `src/components/admin/tournament/ScheduleTab.tsx`（`toLocalDatetimeString`/`fromLocalDatetimeString`，本计划抽到共享文件复用）。

**关键命名（全计划一致）**：`rescheduleMatches`、`groupMatchesByDay`、`SchedulePlanner`。

---

### Task 1: rescheduleMatches 批量改期服务（M 核心，TDD）

spec §2.1。在 `score-service.ts` 新增 `rescheduleMatches(db, { items, actorUserId })`——**全部校验与写入在同一事务内**（codex P1，消除 TOCTOU）：items 非空/≤200/matchId 唯一 → 一次性 load 全部 match（含 season）缺任一 → `MATCH_NOT_FOUND` → 同属一 tournament 且赛季可写 → 逐项乐观锁 CAS → audit。事务内任一 throw → 全回滚（all-or-nothing）。

**codex 非阻塞实现注（必须遵守）**：事务内归档校验必须复用 `assertSeasonWritable` 的**双条件语义**（`season.status === 'ARCHIVED' || season.archivedAt !== null`），**不是只判 `archivedAt`**。因为 batch 已在事务内一次性 load 了 match→tournament→season，再调 `assertSeasonWritable(tx, tournamentId)` 会多打两次 DB（tournament→seasonId→season）。本任务采取**直接复用现有守卫**（传 tx client）以保证语义单一来源：对 batch 已确认全部 match 同属一个 `tournamentId` 后，调用一次 `await assertSeasonWritable(tx, tournamentId)`——它内部委托 `assertSeasonWritableBySeasonId`，已是 `status==='ARCHIVED' || archivedAt!==null` 双条件，归档→抛 `INVALID_STATE`。**绝不内联只判 `archivedAt` 的简化版**。（若未来要省 DB 往返而内联，必须原样复制双条件：见下方实现 Step 3 注释中的等价内联片段。）

**Files:**
- Modify: `src/lib/tournament/score-service.ts`
- Create: `src/lib/tournament/reschedule-matches.test.ts`

- [ ] **Step 1: 写失败测试** — Create `src/lib/tournament/reschedule-matches.test.ts`：

```ts
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
  const groups2 = await testDb.tournamentGroup.findMany({ where: { tournamentId: t2.id }, orderBy: { name: 'asc' } });
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
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/reschedule-matches.test.ts --project unit`
  Expected: FAIL（`rescheduleMatches` 未导出 → import error）。

- [ ] **Step 3: 实现** — 在 `src/lib/tournament/score-service.ts` 末尾追加（`assertSeasonWritable`/`writeAudit`/`TournamentError`/`PrismaClient` 已在该文件 import）：

```ts
const MAX_BATCH = 200;

/**
 * 批量改期（spec §2.1）：全部校验与写入在同一事务内，all-or-nothing。
 * reschedule 不触碰结算，version 仅作并发标记（与单场 rescheduleMatch 一致）。
 */
export async function rescheduleMatches(
  db: PrismaClient,
  input: {
    items: Array<{ matchId: string; expectedVersion: number; scheduledAt: Date | null }>;
    actorUserId: string;
  },
): Promise<void> {
  const { items } = input;
  return db.$transaction(async (tx) => {
    // (a) items 非空 / ≤200 / matchId 唯一
    if (items.length === 0) throw new TournamentError('VALIDATION', '改期列表不能为空');
    if (items.length > MAX_BATCH) throw new TournamentError('VALIDATION', `单次改期不能超过 ${MAX_BATCH} 项`);
    const ids = items.map((i) => i.matchId);
    if (new Set(ids).size !== ids.length) throw new TournamentError('VALIDATION', '比赛重复');

    // (b) 一次性 load 全部 match（缺任一 → MATCH_NOT_FOUND）
    const found = await tx.match.findMany({
      where: { id: { in: ids } },
      select: { id: true, tournamentId: true },
    });
    if (found.length !== ids.length) throw new TournamentError('MATCH_NOT_FOUND', '部分比赛不存在');

    // (c) 全部同属一个 tournament
    const tournamentIds = new Set(found.map((m) => m.tournamentId));
    if (tournamentIds.size !== 1) throw new TournamentError('VALIDATION', '批量改期必须属于同一赛事');
    const tournamentId = found[0].tournamentId;

    // 赛季可写校验——复用现有守卫双条件语义（status==='ARCHIVED' || archivedAt!==null）；
    // 归档 → 抛 INVALID_STATE。绝不内联只判 archivedAt 的简化版。
    // （等价内联，若为省 DB 往返：
    //    const t = await tx.tournament.findUnique({
    //      where: { id: tournamentId },
    //      select: { season: { select: { status: true, archivedAt: true } } },
    //    });
    //    if (t!.season.status === 'ARCHIVED' || t!.season.archivedAt !== null)
    //      throw new TournamentError('INVALID_STATE', '赛季已归档，赛事只读');
    //  —— 必须保留 status||archivedAt 双条件，与 assertSeasonWritableBySeasonId 一致。）
    await assertSeasonWritable(tx, tournamentId);

    // (d) 逐项乐观锁 CAS（count=0 → VERSION_CONFLICT，整体回滚）
    for (const it of items) {
      const res = await tx.match.updateMany({
        where: { id: it.matchId, version: it.expectedVersion },
        data: { scheduledAt: it.scheduledAt, version: { increment: 1 } },
      });
      if (res.count === 0)
        throw new TournamentError('VERSION_CONFLICT', 'VERSION_CONFLICT：部分比赛已被修改，请刷新');
    }

    // (e) 审计一条
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'match.schedule.batch',
      entity: 'Tournament',
      entityId: tournamentId,
      payload: { count: items.length },
    });
  });
}
```

> 注：`assertSeasonWritable(tx, tournamentId)` 在赛事不存在时抛 `TOURNAMENT_NOT_FOUND`，但此处已确认全部 match 存在且同属一 `tournamentId`，该路径不会触发。归档赛季 → 守卫抛 `INVALID_STATE`，`toResponse` 映射 422。

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/reschedule-matches.test.ts --project unit`
  Expected: PASS（9 用例全绿）。

- [ ] **Step 5: 全量回归** — `npx vitest run`
  Expected: 全 PASS（新增导出不破坏既有套件）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/score-service.ts src/lib/tournament/reschedule-matches.test.ts
git commit -m "feat(tournament): rescheduleMatches batch service (in-tx all-or-nothing, CAS per item, archived-guard reuse)"
```

---

### Task 2: 批量改期路由 `POST /api/tournament/admin/schedule/batch`（TDD：Zod 单测 + service 集成）

spec §2.2。`requireAdmin` + Zod 校验 → `scheduledAt` 字符串转 `Date` → `rescheduleMatches` → 成功 `publishTournament` + 200；`ZodError → 422`；`toResponse` 兜底（`VERSION_CONFLICT → 409`）。仓库现有路由无 route-level 单测（参照 `matches/[id]/route.ts`，仅靠 service 测试覆盖逻辑），故本任务**单测 Zod schema**（抽为可导出常量）+ 复用 Task 1 的 service 测试覆盖业务路径。

**Files:**
- Create: `src/app/api/tournament/admin/schedule/batch/route.ts`
- Create: `src/lib/tournament/schedule-batch-schema.ts`（可测的 Zod schema，路由 import）
- Create: `src/lib/tournament/schedule-batch-schema.test.ts`

- [ ] **Step 1: 写失败测试** — Create `src/lib/tournament/schedule-batch-schema.test.ts`：

```ts
import { expect, it } from 'vitest';
import { scheduleBatchSchema } from './schedule-batch-schema';

const ok = { matchId: 'm1', expectedVersion: 0, scheduledAt: '2026-07-01T10:00:00.000Z' };

it('接受合法 body（含 scheduledAt=null）', () => {
  const r = scheduleBatchSchema.safeParse({ items: [ok, { matchId: 'm2', expectedVersion: 3, scheduledAt: null }] });
  expect(r.success).toBe(true);
});

it('拒绝空数组', () => {
  expect(scheduleBatchSchema.safeParse({ items: [] }).success).toBe(false);
});

it('拒绝超 200 项', () => {
  const items = Array.from({ length: 201 }, () => ok);
  expect(scheduleBatchSchema.safeParse({ items }).success).toBe(false);
});

it('拒绝非法 datetime', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, scheduledAt: 'not-a-date' }] }).success).toBe(false);
});

it('拒绝 expectedVersion 非整数', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, expectedVersion: 1.5 }] }).success).toBe(false);
});

it('拒绝 matchId 为空字符串', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, matchId: '' }] }).success).toBe(false);
});
```

> 重复 matchId 的拒绝由 service 层（Task 1 的 `重复 matchId → VALIDATION` 用例）保证，不在 Zod 层重复实现——Zod 仅做形状/边界校验，业务唯一性留给事务内单一来源。

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/schedule-batch-schema.test.ts --project unit`
  Expected: FAIL（`scheduleBatchSchema` 未导出）。

- [ ] **Step 3: 实现 schema** — Create `src/lib/tournament/schedule-batch-schema.ts`：

```ts
import { z } from 'zod';

export const scheduleBatchSchema = z.object({
  items: z
    .array(
      z.object({
        matchId: z.string().min(1),
        expectedVersion: z.number().int(),
        scheduledAt: z.string().datetime().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export type ScheduleBatchBody = z.infer<typeof scheduleBatchSchema>;
```

- [ ] **Step 4: 实现路由** — Create `src/app/api/tournament/admin/schedule/batch/route.ts`（镜像 `matches/[id]/route.ts` PATCH 模式）：

```ts
// src/app/api/tournament/admin/schedule/batch/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rescheduleMatches } from '@/lib/tournament/score-service';
import { scheduleBatchSchema } from '@/lib/tournament/schedule-batch-schema';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = scheduleBatchSchema.parse(await req.json());
    await rescheduleMatches(prisma, {
      items: body.items.map((i) => ({
        matchId: i.matchId,
        expectedVersion: i.expectedVersion,
        scheduledAt: i.scheduledAt ? new Date(i.scheduledAt) : null,
      })),
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
```

- [ ] **Step 5: Run 确认 PASS** — `npx vitest run src/lib/tournament/schedule-batch-schema.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 6: typecheck** — `npm run typecheck`
  Expected: 绿（路由 import 路径正确，`prisma` from `@/lib/db`）。

- [ ] **Step 7: Commit**

```bash
git add src/app/api/tournament/admin/schedule/batch/route.ts \
  src/lib/tournament/schedule-batch-schema.ts src/lib/tournament/schedule-batch-schema.test.ts
git commit -m "feat(tournament): POST /admin/schedule/batch route + zod schema (422 on ZodError, 409 on conflict)"
```

---

### Task 3: groupMatchesByDay 纯函数（TDD）+ 公开 ScheduleList 重构消费

spec §4。把公开时间线的「按本地日期分组 + 当天按时间升序 + 时间待定置底 + 跨天升序」逻辑抽为可测纯函数 `groupMatchesByDay`，置于 `src/lib/tournament/schedule-grouping.ts`（unit 可测）。区块组件抽出 `dayKey`/`sortTime` 便于后续加倒计时（spec §4 留扩展位）。`ScheduleList` 重构消费它（行渲染不变）。

**Files:**
- Create: `src/lib/tournament/schedule-grouping.ts`
- Create: `src/lib/tournament/schedule-grouping.test.ts`
- Modify: `src/components/tournament/ScheduleList.tsx`

- [ ] **Step 1: 写失败测试** — Create `src/lib/tournament/schedule-grouping.test.ts`：

```ts
import { expect, it } from 'vitest';
import { groupMatchesByDay, type SchedulableMatch } from './schedule-grouping';

function mk(id: string, scheduledAt: string | null): SchedulableMatch {
  return { id, scheduledAt };
}

it('按本地日期分组，跨天升序，当天按时间升序', () => {
  const matches = [
    mk('b', '2026-07-02T09:00:00.000Z'),
    mk('a2', '2026-07-01T15:00:00.000Z'),
    mk('a1', '2026-07-01T08:00:00.000Z'),
  ];
  const groups = groupMatchesByDay(matches);
  // 第一天 = 07-01，含 a1 then a2（时间升序）；第二天 = 07-02
  expect(groups[0].matches.map((m) => m.id)).toEqual(['a1', 'a2']);
  expect(groups[1].matches.map((m) => m.id)).toEqual(['b']);
  expect(groups[0].count).toBe(2);
  expect(groups[0].isPending).toBe(false);
});

it('label 含日期与星期', () => {
  const groups = groupMatchesByDay([mk('a', '2026-07-01T08:00:00.000Z')]);
  expect(groups[0].label).toMatch(/2026/);
  expect(groups[0].label).toMatch(/(周|星期)/);
});

it('时间待定（scheduledAt=null）归一个区块且置最底', () => {
  const matches = [
    mk('p1', null),
    mk('d', '2026-07-03T08:00:00.000Z'),
    mk('p2', null),
  ];
  const groups = groupMatchesByDay(matches);
  const last = groups[groups.length - 1];
  expect(last.isPending).toBe(true);
  expect(last.matches.map((m) => m.id).sort()).toEqual(['p1', 'p2']);
  expect(last.count).toBe(2);
  // 有时间的天在前
  expect(groups[0].isPending).toBe(false);
});

it('空输入 → 空数组', () => {
  expect(groupMatchesByDay([])).toEqual([]);
});

it('全部待定 → 单个 pending 区块', () => {
  const groups = groupMatchesByDay([mk('a', null), mk('b', null)]);
  expect(groups).toHaveLength(1);
  expect(groups[0].isPending).toBe(true);
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/schedule-grouping.test.ts --project unit`
  Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** — Create `src/lib/tournament/schedule-grouping.ts`：

```ts
/** 时间线分组所需的最小 match 形状（公开 + 管理读模型都满足）。 */
export type SchedulableMatch = { id: string; scheduledAt: string | null };

export type DayGroup<M extends SchedulableMatch> = {
  /** 排序键：有时间 = 'YYYY-MM-DD'（本地）；待定 = '￿' 保证置底。 */
  dayKey: string;
  /** 展示标签：'2026年7月1日 周三'；待定 = '时间待定'。 */
  label: string;
  /** 该天比赛数。 */
  count: number;
  /** 是否为「时间待定」区块。 */
  isPending: boolean;
  /** 当天比赛，按 scheduledAt 升序（待定区块保持输入顺序）。 */
  matches: M[];
};

const PENDING_KEY = '￿';
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY[d.getDay()]}`;
}

/**
 * 公开/管理时间线：按本地日期分组。
 * - 有时间的天按日期升序在前；当天按 scheduledAt 升序。
 * - scheduledAt==null 归「时间待定」单一区块，置最底。
 * 纯函数，无副作用，可单测。
 */
export function groupMatchesByDay<M extends SchedulableMatch>(matches: M[]): DayGroup<M>[] {
  const buckets = new Map<string, { label: string; isPending: boolean; matches: M[] }>();

  for (const m of matches) {
    if (m.scheduledAt === null) {
      const b = buckets.get(PENDING_KEY) ?? { label: '时间待定', isPending: true, matches: [] };
      b.matches.push(m);
      buckets.set(PENDING_KEY, b);
      continue;
    }
    const d = new Date(m.scheduledAt);
    const key = localDayKey(d);
    const b = buckets.get(key) ?? { label: dayLabel(d), isPending: false, matches: [] };
    b.matches.push(m);
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b)) // PENDING_KEY = '￿' 自然置底
    .map(([dayKey, b]) => ({
      dayKey,
      label: b.label,
      isPending: b.isPending,
      count: b.matches.length,
      matches: b.isPending
        ? b.matches
        : [...b.matches].sort(
            (x, y) => new Date(x.scheduledAt!).getTime() - new Date(y.scheduledAt!).getTime(),
          ),
    }));
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/schedule-grouping.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: 重构 ScheduleList 消费纯函数** — Modify `src/components/tournament/ScheduleList.tsx`：删除内联 `getDateKey` + `Map` 分组，改 `const groups = groupMatchesByDay(matches);`。区块头从 `dateKey` 改为 `{group.label} · {group.count} 场`（spec §4：日期+星期+「N 场」）；遍历 `group.matches` 渲染**现有行**（时间 `HH:mm`、label、对阵、`StatusBadge`、`Link href={/tournament/match/${id}}`）不动。`StatusBadge`/取消行 line-through 逻辑保留。`Match` 类型已满足 `SchedulableMatch`（含 `id`/`scheduledAt`），调 `groupMatchesByDay<Match>(matches)` 泛型保留完整字段。

- [ ] **Step 6: typecheck** — `npm run typecheck`
  Expected: 绿（公开组件对 narrowed `PublicState` 编译通过——`Match` 含 `id`/`scheduledAt`/`label`/`status`/`teamA`/`teamB`/`bestOf`/`winnerTeamId`/`isWalkover`）。

- [ ] **Step 7: 全量回归 + Commit**

```bash
npx vitest run
git add src/lib/tournament/schedule-grouping.ts src/lib/tournament/schedule-grouping.test.ts \
  src/components/tournament/ScheduleList.tsx
git commit -m "feat(tournament): groupMatchesByDay pure fn + public ScheduleList day-timeline (date+weekday+N场, 待定置底)"
```

---

### Task 4: 公开 ScheduleList 时间线增强（验收 + 收口）

spec §4。Task 3 已落地纯函数与重构；本任务确认公开侧时间线增强完整、对 narrowed `PublicState` 编译，并补行内细节（区块头样式、待定区块文案、不引入倒计时）。

> 与 Task 3 合并执行还是拆分由实现者定；拆分是为让 Task 3 聚焦「纯函数 TDD」、Task 4 聚焦「公开 UI 验收」。若 Task 3 Step 5 已把 UI 改全，本任务退化为验收 + 截图。

**Files:**
- Modify: `src/components/tournament/ScheduleList.tsx`（如 Task 3 未完则补全）

**实现要点（prose）：**
- [ ] **Step 1: 区块头** — 每天区块头 = `group.label`（`2026年7月1日 周三`）+ 右侧淡色 `{group.count} 场` 计数徽标（`text-xs text-muted-foreground`）。`group.isPending` 的区块头文案为「时间待定 · N 场」，置于所有有日期区块之后（纯函数已保证排序）。
- [ ] **Step 2: 行内不变** — 行沿用现有：左侧 `HH:mm`（待定区块无时间则不显时间段，仅显 label/对阵）、`label`、`teamA vs teamB`、`StatusBadge`（轮空/已取消 line-through/已结束胜者/`BO{bestOf}`）、点击进 `/tournament/match/{id}`（取消行不可点）。
- [ ] **Step 3: 不引入倒计时** — 本期不做倒计时/「今日」高亮（spec §6 范围外）；纯函数已暴露 `dayKey`，后续迭代可据此加「今日」定位，本任务不实现。
- [ ] **Step 4: SSE 重拉** — 沿用现有 `useTournamentState` 的 `tournament.invalidated → refetch`（`PublicTournamentView` 已接好），无需改动。
- [ ] **Step 5: typecheck + 手动 smoke** — `npm run typecheck`；`npm run dev`（端口见 Task 8）→ 打开 `/tournament` 赛程 Tab → 确认按天分组、区块头含星期与场次、待定置底。
- [ ] **Step 6: Commit**（若本任务有改动）

```bash
git add src/components/tournament/ScheduleList.tsx
git commit -m "feat(tournament): public schedule timeline polish (count badge, pending block copy)"
```

---

### Task 5: SchedulePlanner 纯逻辑（TDD）

spec §3.2。抽出排期面板的核心纯逻辑到 `src/lib/tournament/schedule-planner.ts`（unit 可测）：(1) 把 matches 拆为「未排期池」+「按天分栏」（排除 `status==='CANCELED'`）；(2) 同一 `(dayKey, HH:mm)` 的并行计数；(3) 「自动顺排」算法（起始时间 + 间隔 → 生成 `items[]`）。拖拽交互本身（DOM 事件）以手动验收为主，但**算法**全部可单测。

**Files:**
- Create: `src/lib/tournament/schedule-planner.ts`
- Create: `src/lib/tournament/schedule-planner.test.ts`

- [ ] **Step 1: 写失败测试** — Create `src/lib/tournament/schedule-planner.test.ts`：

```ts
import { expect, it } from 'vitest';
import {
  splitPlannerColumns,
  parallelCountAt,
  autoSequenceItems,
  type PlannerMatch,
} from './schedule-planner';

function mk(id: string, scheduledAt: string | null, status = 'SCHEDULED'): PlannerMatch {
  return { id, scheduledAt, status, version: 0 };
}

it('splitPlannerColumns：未排期入池，已排期按天分栏，排除 CANCELED', () => {
  const r = splitPlannerColumns([
    mk('u1', null),
    mk('x', '2026-07-01T08:00:00.000Z'),
    mk('y', '2026-07-01T10:00:00.000Z'),
    mk('c', '2026-07-02T08:00:00.000Z', 'CANCELED'),
    mk('u2', null, 'CANCELED'), // 取消的未排期也排除
  ]);
  expect(r.pool.map((m) => m.id)).toEqual(['u1']);
  expect(r.columns).toHaveLength(1); // 仅 07-01 一栏（07-02 那场被取消）
  expect(r.columns[0].matches.map((m) => m.id)).toEqual(['x', 'y']); // 时间升序
  expect(r.columns[0].count).toBe(2);
});

it('parallelCountAt：同天同 HH:mm 计数', () => {
  const ms = [
    mk('a', '2026-07-01T08:00:00.000Z'),
    mk('b', '2026-07-01T08:00:00.000Z'),
    mk('c', '2026-07-01T09:00:00.000Z'),
  ];
  // a 所在时段（08:00）并行 2 场
  expect(parallelCountAt(ms, ms[0])).toBe(2);
  expect(parallelCountAt(ms, ms[2])).toBe(1);
});

it('autoSequenceItems：起始时间 + 间隔 → 顺排 items', () => {
  const pool = [mk('p1', null), mk('p2', null), mk('p3', null)];
  const start = new Date('2026-07-05T13:00:00.000Z');
  const items = autoSequenceItems(pool, { start, intervalMinutes: 30 });
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ matchId: 'p1', expectedVersion: 0 });
  expect(new Date(items[0].scheduledAt!).getTime()).toBe(start.getTime());
  expect(new Date(items[1].scheduledAt!).getTime()).toBe(start.getTime() + 30 * 60_000);
  expect(new Date(items[2].scheduledAt!).getTime()).toBe(start.getTime() + 60 * 60_000);
});

it('autoSequenceItems：空池 → 空 items', () => {
  expect(autoSequenceItems([], { start: new Date(), intervalMinutes: 30 })).toEqual([]);
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/schedule-planner.test.ts --project unit`
  Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** — Create `src/lib/tournament/schedule-planner.ts`（复用 `groupMatchesByDay` 做分栏，避免重复排序逻辑）：

```ts
import { groupMatchesByDay, type DayGroup } from './schedule-grouping';

/** 排期面板所需 match 形状（管理读模型 AdminMatch 满足：id/scheduledAt/status/version）。 */
export type PlannerMatch = { id: string; scheduledAt: string | null; status: string; version: number };

export type PlannerColumn<M extends PlannerMatch> = DayGroup<M>;

export type RescheduleItem = { matchId: string; expectedVersion: number; scheduledAt: string | null };

/** 拆为未排期池 + 按天分栏。排除 status==='CANCELED'。 */
export function splitPlannerColumns<M extends PlannerMatch>(
  matches: M[],
): { pool: M[]; columns: PlannerColumn<M>[] } {
  const active = matches.filter((m) => m.status !== 'CANCELED');
  const pool = active.filter((m) => m.scheduledAt === null);
  const scheduled = active.filter((m) => m.scheduledAt !== null);
  // groupMatchesByDay 对全有时间的输入返回纯日期栏（无 pending 区块）
  const columns = groupMatchesByDay(scheduled);
  return { pool, columns };
}

/** target 同天同 HH:mm 的并行场次数（含自身）。target.scheduledAt 必须非空。 */
export function parallelCountAt<M extends PlannerMatch>(matches: M[], target: M): number {
  if (target.scheduledAt === null) return 0;
  const slot = (s: string) => {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const key = slot(target.scheduledAt);
  return matches.filter((m) => m.scheduledAt !== null && slot(m.scheduledAt) === key).length;
}

/** 自动顺排：从 start 起按 intervalMinutes 依次给 pool 排期，生成 batch items（按池顺序）。 */
export function autoSequenceItems<M extends PlannerMatch>(
  pool: M[],
  opts: { start: Date; intervalMinutes: number },
): RescheduleItem[] {
  return pool.map((m, i) => ({
    matchId: m.id,
    expectedVersion: m.version,
    scheduledAt: new Date(opts.start.getTime() + i * opts.intervalMinutes * 60_000).toISOString(),
  }));
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/schedule-planner.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: 全量回归 + Commit**

```bash
npx vitest run
git add src/lib/tournament/schedule-planner.ts src/lib/tournament/schedule-planner.test.ts
git commit -m "feat(tournament): schedule-planner pure logic (split columns, parallel count, auto-sequence)"
```

---

### Task 6: SchedulePlanner UI 组件

spec §3.2 + §3.3。自研轻量排期面板：左「未排期池」+ 右「按天分栏」。桌面 HTML5 拖拽（`draggable` 卡片 + 列/池 `onDragOver`/`onDrop`），落下弹**时间选择 Dialog**（house ui 无 popover.tsx，用 Dialog）；移动端（`pointer:coarse` 媒体查询或视口宽度）点卡片弹「日期+时间」编辑 Dialog（含「移回未排期」）。两套入口共用同一 `save` 函数 → `POST /api/tournament/admin/schedule/batch`（单 item）→ **成功 `await refetch()`**（codex P1：batch increment version，统一 refetch 避免旧 version 打 409）→ 失败 toast + refetch。「自动顺排」按钮（起始时间+间隔小表单 → `autoSequenceItems` → 一次 batch）。并行角标。归档/赛季只读隐藏拖拽。

**Files:**
- Create: `src/components/admin/tournament/SchedulePlanner.tsx`
- Create: `src/components/admin/tournament/datetime-local.ts`（抽 `toLocalDatetimeString`/`fromLocalDatetimeString` 供 ScheduleTab + Planner 共用）
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`（改 import 共享 datetime helper，删内联副本）

**实现要点（prose + 契约）：**

- [ ] **Step 1: 抽共享 datetime helper** — Create `src/components/admin/tournament/datetime-local.ts`，把 `ScheduleTab.tsx` 现有的 `toLocalDatetimeString(iso: string | null): string` 与 `fromLocalDatetimeString(local: string): string | null` 原样移入并导出；`ScheduleTab.tsx` 改为 `import { toLocalDatetimeString, fromLocalDatetimeString } from './datetime-local';`（删内联）。Planner 复用同一对，保证管理端时区/格式一致。

- [ ] **Step 2: SchedulePlanner 组件** — Create `src/components/admin/tournament/SchedulePlanner.tsx`：

  - **Props**：
    ```ts
    type Props = {
      state: AdminState;                 // 来自 useAdminTournamentState（matches 含 version）
      refetch: () => Promise<void>;
      seasonId: string;
      readOnly?: boolean;                // 赛季归档/只读时由父传 true
    };
    ```
  - **数据**：`const matches = (state?.matches ?? [])`，传入 `splitPlannerColumns(matches as PlannerMatch[])` 得 `{ pool, columns }`（`AdminMatch` 含 `id/scheduledAt/status/version`，满足 `PlannerMatch`）。卡片显示对阵双方名（`m.teamA?.name ?? '待定' vs m.teamB?.name ?? '待定'`）+ 阶段/轮次标签（简化为 `m.label ?? m.roundKey ?? '小组赛'`）+ `BO{bestOf}`。已排期卡片额外显 `HH:mm`。
  - **布局**：flex 横向；左固定列「未排期池」（`pool` 卡片纵向堆叠）；右横向滚动「按天分栏」（`columns` 每栏栏头 `group.label · {count} 场`，栏内卡片按时间升序）。`readOnly` 时所有卡片不可拖、不弹编辑（仅展示），并在顶部显「赛季已归档，排期只读」提示。
  - **桌面拖拽（HTML5）**：卡片 `draggable={!readOnly}` + `onDragStart={(e)=>e.dataTransfer.setData('text/plain', m.id)}`；列与池容器 `onDragOver={(e)=>e.preventDefault()}` + `onDrop`：
    - drop 到某天栏 → 打开**时间选择 Dialog**：`<input type="datetime-local">`（预填该栏日期 + 拖动卡原时间或默认整点；5 分钟步进 `step={300}`，可手填任意分钟）→ 确认 → `save(matchId, fromLocalDatetimeString(local))`。
    - drop 回未排期池 → `save(matchId, null)`（清空）。
    - 同栏/跨栏移动 → 同样弹时间 Dialog（预填原时间所在日 + 目标栏日期）。
  - **移动端降级**：`window.matchMedia('(pointer: coarse)')` 检测（client effect 里读，避免 SSR 不一致）；coarse 时卡片改为 `onClick` 打开「编辑 Dialog」——含 `datetime-local` 输入 + 「移回未排期」按钮（调 `save(matchId, null)`）+ 「保存」（调 `save(matchId, iso)`）。**两套入口共用同一 `save` 函数**。
  - **save 函数契约**（codex P1）：
    ```ts
    async function save(matchId: string, scheduledAt: string | null) {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return;
      const res = await fetch('/api/tournament/admin/schedule/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ matchId, expectedVersion: m.version, scheduledAt }] }),
      });
      if (res.ok) {
        await refetch();                       // 成功也 refetch：version 已 +1
      } else if (res.status === 409) {
        toast.error('部分比赛已被修改，已刷新');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '排期失败');
        await refetch();                       // 失败也 refetch 回滚乐观更新
      }
    }
    ```
    可选乐观更新：drop 后先本地移动卡片即时反馈，再 `save`；任何分支末尾 `refetch` 收口为权威状态。
  - **自动顺排**：顶部「自动顺排」按钮打开小 Dialog（起始 `datetime-local` + 间隔分钟 `Input number`，默认 30）→ 确认 → `const items = autoSequenceItems(pool as PlannerMatch[], { start: new Date(local), intervalMinutes });` → 一次 `POST batch`（多 item）→ refetch。空池时按钮禁用。
  - **并行角标**：卡片渲染时 `const n = parallelCountAt(matches as PlannerMatch[], m as PlannerMatch);` 若 `n > 1` 显淡色 `Badge variant="outline">同时段 ×{n}`，不阻断保存。
  - **端点契约**：`POST /api/tournament/admin/schedule/batch` body `{ items: [{ matchId, expectedVersion, scheduledAt: ISO|null }] }`；200 → `{ ok: true }`；409 → version 冲突；422 → 校验/归档。

- [ ] **Step 3: typecheck + lint + 手动 smoke** — `npm run typecheck && npm run lint`；`npm run dev`（端口见 Task 8）→ 管理端赛程 → 排期视图（Task 7 接入后）→ 拖一张未排期卡到某天设时间 → 卡片移到该栏，刷新后保留。
  Expected: 绿。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/tournament/SchedulePlanner.tsx \
  src/components/admin/tournament/datetime-local.ts src/components/admin/tournament/ScheduleTab.tsx
git commit -m "feat(tournament): SchedulePlanner UI (HTML5 drag desktop + mobile click-edit, auto-sequence, parallel badge, refetch-on-success)"
```

---

### Task 7: ScheduleTab 视图切换整合

spec §3（位置：管理端「赛程」Tab 顶部加「列表 / 排期」视图切换，默认列表，保留现有表格不动）。

**Files:**
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`
- Modify: `src/components/admin/tournament/TournamentAdmin.tsx`（透传 seasonId）

**实现要点（prose）：**

- [ ] **Step 1: 视图切换** — 在 `ScheduleTab` 顶部 action bar 加「列表 / 排期」切换（用 `useState<'list'|'planner'>('list')` + 两个 `Button`/`variant` 切换）。默认 `list`，渲染现有表格（不动）。
- [ ] **Step 2: 挂载 SchedulePlanner** — `planner` 视图渲染 `<SchedulePlanner state={state} refetch={refetch} seasonId={seasonId} readOnly={readOnly} />`。`readOnly` 由赛季态推导：若管理读模型暴露赛季归档标记则据此；否则保守传 `false`（后端守卫兜底，前端只读仅为体验优化）。
- [ ] **Step 3: 透传 seasonId** — Modify `src/components/admin/tournament/TournamentAdmin.tsx`：`<ScheduleTab teams={teams} state={state} refetch={refetch} seasonId={seasonId} />`；`ScheduleTab` 的 `Props` 增 `seasonId: string`。
- [ ] **Step 4: typecheck + lint** — `npm run typecheck && npm run lint`
  Expected: 绿。
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/tournament/ScheduleTab.tsx src/components/admin/tournament/TournamentAdmin.tsx
git commit -m "feat(tournament): ScheduleTab list/planner view toggle, mount SchedulePlanner"
```

---

### Task 8: E2E 实跑 + 回归 + 构建

spec §5（**部署前必须实际执行**）。扩展 `scripts/e2e-tournament.spec.ts`：在管理端排期面板把一场未排期比赛拖到某天 + 设时间 → 保存 → 公开赛程页该比赛出现在对应日期区块。实跑 E2E（dev server 必须监听 `3103`，与 spec/playwright.config 的 baseURL 一致），全量 vitest，typecheck+build。E2E 跑后恢复本地 DB 赛季状态。

**Files:**
- Modify: `scripts/e2e-tournament.spec.ts`

- [ ] **Step 1: 扩展 E2E spec**（prose）— 在现有「分组确认 → 12 场小组赛生成」之后、录分之前，插入排期面板段（或独立 test）：
  - 管理端赛程 Tab → 点「排期」视图切换（`button:has-text("排期")`）。
  - 桌面路径（默认 viewport 1280×900，`pointer:fine` → 拖拽）：用 `page.locator(card).dragTo(page.locator(column))` 把未排期池首张卡拖到第一天栏；若无任何已排期日栏，先用「自动顺排」按钮（点「自动顺排」→ 填起始时间 `input[type="datetime-local"]` `fill('2026-07-01T18:00')` + 间隔 → 确认，一次 batch 铺满池）；时间选择 Dialog 出现则填 `datetime-local` → 点确认/保存。
  - **若拖拽不稳定**（HTML5 DnD 在 headless 偶发），优先走「自动顺排」按钮路径：一次性给整池排期、断言更稳。
  - **断言**：
    - 管理端：`apiGet('/api/tournament/public/state')` 该 match `scheduledAt` 非空（或目标日期）。
    - 公开端：`nav(publicPage, '/tournament')` → 赛程 Tab → 断言出现对应日期区块文案（含年/月/日，如 `text=2026年7月1日` 子串）且该场卡片在该区块内。
  - 现有 reset/创建/分组/录分段保持不变。
- [ ] **Step 2: 实跑 E2E（REQUIRED）** — 精确命令（dev 必须在 3103，与 `scripts/playwright.config.ts` baseURL 对齐）：
  ```bash
  # 1) 准备测试库 + 种子（8 队 COMPLETED 赛季）
  npm run db:reset
  node scripts/seed-e2e.mjs
  # 2) 起 dev server（后台）监听 3103（playwright baseURL）
  PORT=3103 npm run dev &
  # 等待 http://localhost:3103 就绪（轮询 curl 直到 200）
  # 3) 跑 E2E（Playwright spec）
  npx playwright test --config scripts/playwright.config.ts scripts/e2e-tournament.spec.ts
  ```
  > admin 登录 `admin` / `lol2026`（spec 头注 + 现有 spec 确认）。**本 Task 必须真正运行并通过**（spec §5）。跑完后停 dev server，并按需重置 DB（`npm run db:reset` 或恢复本地非 e2e 赛季）以恢复本地状态。
  Expected: E2E 绿——含新的排期面板拖拽/顺排 + 公开赛程日期区块断言。
- [ ] **Step 3: 全量回归** — `npx vitest run`
  Expected: exit 0，全绿。
- [ ] **Step 4: typecheck + lint + build** — `npm run typecheck && npm run lint && npm run build`
  Expected: exit 0。注意 lint error 会让 build 失败（装饰性 `//` 文本须转义——沿用 M1/M2 经验）。
- [ ] **Step 5: Commit**

```bash
git add scripts/e2e-tournament.spec.ts
git commit -m "test(tournament): e2e schedule planner (drag/auto-sequence) → public day-block assertion"
```

---

## Spec 覆盖表（§ → Task）

| Spec § | 要求 | Task |
|---|---|---|
| §1 范围 A 管理拖拽排期 + B 公开时间线 | SchedulePlanner + ScheduleList 增强 | 6, 7, 3, 4 |
| §1 决策：形态一轻量自研、无第三方日历库 | SchedulePlanner HTML5 拖拽 | 6 |
| §1 决策：并行允许，仅淡色提示不阻断 | `parallelCountAt` + 角标 | 5, 6 |
| §1 决策：倒计时/进行中本期不做，留扩展位 | `dayKey`/`sortTime` 抽出，不实现倒计时 | 3, 4 |
| §1 决策：时间粒度 5 分钟可手填 | 时间 Dialog `step=300` + 手填 | 6 |
| §1 决策：零 schema 变更 | 全计划遵守（无 prisma 改动） | — |
| §1 决策：单场沿用现有 PATCH op=reschedule，新增批量端点 | 单场不动 + `rescheduleMatches` + batch 路由 | 1, 2 |
| §2.1 rescheduleMatches（事务内 all-or-nothing：非空/≤200/唯一/load/同赛事/可写/逐项 CAS/audit） | service | 1 |
| §2.1 codex P1 事务内归档校验（双条件语义复用 assertSeasonWritable） | service Step 3 注 | 1 |
| §2.1 codex P2 重复 matchId → VALIDATION | service 校验 (a) | 1 |
| §2.1 version 仅并发标记，不触结算 | updateMany 只改 scheduledAt+version | 1 |
| §2.2 POST /admin/schedule/batch（requireAdmin/Zod ≥1 ≤200/转 Date/publish/422/409 兜底） | route + schema | 2 |
| §3 位置：赛程 Tab 列表/排期切换（默认列表，表格不动） | ScheduleTab 视图切换 | 7 |
| §3.1 数据来自 useAdminTournamentState，排除 CANCELED | `splitPlannerColumns` 过滤 | 5, 6 |
| §3.2 左未排期池 + 右按天分栏（栏头日期+星期+场次） | splitColumns + groupMatchesByDay + UI | 5, 6 |
| §3.2 桌面 HTML5 拖拽（池↔天，弹时间 Dialog，拖回池=null） | SchedulePlanner 拖拽 | 6 |
| §3.2 成功后 await refetch（codex P1，version+1 防 409） | save 函数 | 6 |
| §3.2 移动端降级（pointer:coarse 点卡片编辑 Dialog + 移回未排期），共用保存函数 | SchedulePlanner mobile path | 6 |
| §3.2 并行提示「同时段 ×N」不阻断 | parallelCountAt + 角标 | 5, 6 |
| §3.2 自动顺排（起始时间+间隔 → 一次 batch） | autoSequenceItems + 表单 | 5, 6 |
| §3.3 归档/状态只读（后端兜底 + 前端隐藏拖拽仅展示） | readOnly prop | 6, 7 |
| §4 公开时间线：每天区块头日期+星期+「N 场」；当天升序；待定置底；跨天升序 | groupMatchesByDay + ScheduleList | 3, 4 |
| §4 行内沿用（时间/label/对阵/徽章/详情链接） | ScheduleList 行不变 | 3, 4 |
| §4 抽 dayKey/sortTime 便于后续倒计时 | DayGroup.dayKey | 3 |
| §4 SSE 失效重拉（沿用 useTournamentState） | 无改动复用 | 4 |
| §5 rescheduleMatches TDD（批量/null/冲突回滚/异赛事/重复/缺失/归档/version+1/audit） | reschedule-matches.test | 1 |
| §5 路由 Zod 校验（空/超 200/非法 datetime/重复）+ 冲突 409 + 成功 publish | schema.test + service 测试 | 2, 1 |
| §5 groupMatchesByDay 纯函数测试（排序/分组/待定置底/空态） | schedule-grouping.test | 3 |
| §5 SchedulePlanner 核心排序/分组/并行计数纯函数测试 | schedule-planner.test | 5 |
| §5 E2E 实跑（拖一场到某天设时间 → 公开赛程对应日期区块出现） | e2e spec + 实跑 | 8 |
| §5 全量回归 + typecheck + build | 各 Task + Task 8 收尾 | 1-8 |
| §6 范围外（倒计时/今日/直播/iCal/冲突避让/周历网格） | 不实现 | — |

---

## 实施顺序与依赖说明

- **服务层链（先于 UI）**：Task 1（`rescheduleMatches`，被 batch 路由 + UI 依赖；含 codex 双条件归档校验）→ Task 2（batch 路由 + Zod schema，依赖 Task 1 的 service）。两者是后端基座。
- **纯函数层（可与服务层并行）**：Task 3（`groupMatchesByDay`，公开时间线核心，且 Task 5 `splitPlannerColumns` 复用它）→ Task 5（`schedule-planner` 纯逻辑，依赖 Task 3 的 `groupMatchesByDay`）。Task 3 同时重构公开 `ScheduleList`。
- **公开 UI**：Task 4（公开时间线验收/收口，依赖 Task 3 纯函数与重构；可与 Task 3 合并执行）。
- **管理 UI 链**：Task 6（`SchedulePlanner` 组件，依赖 Task 2 batch 路由 + Task 5 纯逻辑）→ Task 7（`ScheduleTab` 视图切换 + 透传 seasonId，挂载 Task 6 的组件）。6→7 强依赖。
- **收尾**：Task 8（E2E 实跑 + 全量回归 + typecheck + build，依赖全部 service/路由/UI；**强制真实执行**；dev 必须监听 3103 与 playwright baseURL 对齐；跑后恢复本地 DB）。
- **codex 实现注贯穿**：Task 1 事务内归档校验**必须复用 `assertSeasonWritable` 双条件语义**（`status==='ARCHIVED' || archivedAt!==null`），其测试用例「只设 `status=ARCHIVED`、`archivedAt` 仍 null 也必须被拦」正是为防退化成 archivedAt-only。
- **纯函数文件位置约束**：`groupMatchesByDay`/`schedule-planner`/`schedule-batch-schema` 及其测试均置于 `src/lib/**`，以命中 unit 项目 `include: ['src/lib/**/*.test.ts']`，用 `--project unit` 运行。
- **零 schema 变更**：全程不动 `prisma/schema.prisma`、不跑 migrate（`Match.scheduledAt DateTime?` 早已存在）。
- **测试命令**：`npx vitest run <file> --project unit`（unit 项目在 `vitest.workspace.ts`）；全量回归 `npx vitest run`。
