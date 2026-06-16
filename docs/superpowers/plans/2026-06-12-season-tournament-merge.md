# 赛季-赛事整合 实施计划（逻辑合一）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地「赛季-赛事整合」（spec rev.3：`docs/superpowers/specs/2026-06-12-season-tournament-merge-design.md`）：创建赛季同事务自动建赛事骨架（kind + config 必填）；赛事创建拆为「骨架先行（createTournamentShell）+ 分组时绑队（assignGroups 重建快照）」；新增 updateTournamentConfig / resetTournament，退役 createTournament / deleteTournament；全部 tournament 写服务前置「归档赛季只读」守卫；UI 把配置表单抽成 TournamentConfigForm 供 SeasonManager 与 SetupTab 共用。

**Architecture:** 沿用 M1 纯 CRUD + 派生计算。存储仍是 Season / Tournament 两表（1:1，FK Cascade），体验上单一实体。服务层纯函数（`db` 入参，`Db = PrismaClient | Prisma.TransactionClient`）；`createTournamentShell` 自身**不开事务**，由调用方（createSeason 事务 / fallback 路由事务）保证原子性。零 schema 变更、零迁移。

**Tech Stack:** Next.js 15 App Router、Prisma 5 + PostgreSQL 16、Zod、vitest（`--project unit` 名下 DB 集成测试基建已存在）、SSE（已上线）。

**范围外**（spec §8）：一季多赛事；M2 内容；生产数据迁移。

**约定**：所有命令在仓库根执行；测试命令 `npx vitest run <file> --project unit`；每个 Task 结束必须 commit（前缀 `feat(tournament)` / `feat(season)` / `test` / `chore`）。现有模式参考：service 风格 `src/lib/tournament/tournament-service.ts`、`src/lib/season/season-service.ts`；错误类 `src/lib/tournament/errors.ts`；测试 DB `src/lib/test/db.ts`；模板 `src/lib/tournament/templates/group-knockout.ts`；路由守卫 `src/lib/api-guards.ts`、`src/lib/tournament/route-errors.ts`；SSE `src/server/tournament-bus.ts`。

**关键命名（全计划一致）**：`createSkeletonRecords`、`clearTournamentStructure`、`createTournamentShell`、`updateTournamentConfig`、`resetTournament`、`createTestTournament`、`assertSeasonWritable`、`assertSeasonWritableBySeasonId`。

---

### Task 1: guards.ts 归档只读守卫（TDD）

`createTournamentShell`（fallback 创建时尚无 tournamentId）需要按 seasonId 校验；其余写服务按 tournamentId 校验。两个变体共享一段判定逻辑，抛 `TournamentError('INVALID_STATE', '赛季已归档，赛事只读')`。然后接入所有现有写服务。

**Files:**
- Create: `src/lib/tournament/guards.ts`
- Create: `src/lib/tournament/guards.test.ts`
- Modify: `src/lib/tournament/groups-service.ts`（assignGroups / confirmGroups 前置）
- Modify: `src/lib/tournament/bracket-service.ts`（closeGroupStage 前置）
- Modify: `src/lib/tournament/schedule-service.ts`（addCustomMatch 前置）
- Modify: `src/lib/tournament/score-service.ts`（recordGame / deleteGame / setWalkover / cancelMatch / rescheduleMatch：事务内 claim 前调用）

- [ ] **Step 1: 写 guards.ts（实现先行——纯守卫无需 TDD 红，但其接入由 guards.test.ts 端到端验证 FAIL→PASS）**

`src/lib/tournament/guards.ts`：

```ts
import { TournamentError } from './errors';
import type { Db } from './types';

/** 赛季归档（status ARCHIVED 或 archivedAt 非空）则抛错。供 createTournamentShell 等无 tournamentId 入口使用。 */
export async function assertSeasonWritableBySeasonId(db: Db, seasonId: string): Promise<void> {
  const season = await db.season.findUnique({
    where: { id: seasonId },
    select: { status: true, archivedAt: true },
  });
  if (!season) throw new TournamentError('SEASON_NOT_FOUND', '赛季不存在');
  if (season.status === 'ARCHIVED' || season.archivedAt !== null)
    throw new TournamentError('INVALID_STATE', '赛季已归档，赛事只读');
}

/** 经 tournament 取 seasonId 后委托 assertSeasonWritableBySeasonId。供所有按 tournamentId 的写服务使用。 */
export async function assertSeasonWritable(db: Db, tournamentId: string): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { seasonId: true },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);
}
```

- [ ] **Step 2: 写 guards.test.ts（应 FAIL——守卫尚未接入各写服务）**

`src/lib/tournament/guards.test.ts`：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { addCustomMatch } from './schedule-service';
import { recordGame } from './score-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

/** 建赛事 + 分组 + 确认，停在 GROUP_STAGE；返回首场小组赛与 groupId。 */
async function toGroupStage() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
  const match = (await testDb.match.findFirst({ where: { groupId: groups[0].id } }))!;
  return { seasonId, teamIds, t, groups, match };
}

async function archive(seasonId: string) {
  await testDb.season.update({
    where: { id: seasonId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

it('归档赛季：recordGame 拒绝', async () => {
  const { seasonId, match } = await toGroupStage();
  const fresh = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  await archive(seasonId);
  await expect(
    recordGame(testDb, { matchId: match.id, expectedVersion: fresh.version, winnerTeamId: match.teamAId!, actorUserId: 'u' }),
  ).rejects.toThrow(/归档/);
});

it('归档赛季：addCustomMatch 拒绝', async () => {
  const { seasonId, t, groups, teamIds } = await toGroupStage();
  await archive(seasonId);
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: groups[0].id,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: '加赛', countsForStandings: true, actorUserId: 'u',
    }),
  ).rejects.toThrow(/归档/);
});

it('归档赛季：closeGroupStage 拒绝', async () => {
  const { seasonId, t } = await toGroupStage();
  await archive(seasonId);
  await expect(closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/归档/);
});

it('归档赛季：assignGroups 拒绝', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  await archive(seasonId);
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/归档/);
});
```

> 说明：本测试依赖 Task 5 引入的 `createTestTournament` 夹具。**实施顺序**：先做 Task 3（shell）→ Task 5 Step 1（夹具），再回填本测试一次性绿。若严格按编号走，本任务先只接入守卫，并以 `npx vitest run --project unit` 全量验证不破坏现有用例（现有 `seedSeasonWithTeams` 造的赛季 status=COMPLETED，非归档，仍全 PASS）。

- [ ] **Step 3: Run 确认现状（接入前）** — `npx vitest run src/lib/tournament/guards.test.ts --project unit`
  Expected: FAIL（`createTestTournament` 尚不存在 → import error，或归档后写服务未拒绝）。记录失败即可。

- [ ] **Step 4: 接入 groups-service.ts**

`assignGroups` 在 `if (t.status !== 'SETUP')` 之后插入 `await assertSeasonWritableBySeasonId(db, t.seasonId);`；`confirmGroups` 在 `if (t.status !== 'SETUP')` 之后插入同一行。文件顶部加：

```ts
import { assertSeasonWritableBySeasonId } from './guards';
```

（`t` 已含 `seasonId`，用 BySeasonId 变体避免二次查询。注意：本任务接入后，Task 4 会进一步改写 assignGroups——届时守卫行保留。）

- [ ] **Step 5: 接入 bracket-service.ts**

`closeGroupStage` 在 `if (t.status !== 'GROUP_STAGE')` 之后插入 `await assertSeasonWritableBySeasonId(db, t.seasonId);`，顶部 `import { assertSeasonWritableBySeasonId } from './guards';`。

- [ ] **Step 6: 接入 schedule-service.ts**

`addCustomMatch` 在 `if (!t) throw ...` 之后、`if (t.status === 'FINISHED')` 之前插入 `await assertSeasonWritableBySeasonId(db, t.seasonId);`，顶部 import。（`t` 已 findUnique，含 seasonId。）

- [ ] **Step 7: 接入 score-service.ts（事务内，claim 之前）**

5 个写函数 `recordGame / deleteGame / setWalkover / cancelMatch / rescheduleMatch` 各自 `db.$transaction(async (tx) => {` 内、`claimMatch` 调用之前插入：

```ts
    await assertSeasonWritable(tx, input.matchId);
```

顶部 `import { assertSeasonWritable } from './guards';`。守卫在事务内、版本认领前执行——归档时直接抛错，version 不被消耗。

- [ ] **Step 8: Run 确认（夹具就绪后）** — `npx vitest run src/lib/tournament/guards.test.ts --project unit`
  Expected: 若 Task 3/5 已落地则 PASS；否则跑 `npx vitest run --project unit` 确认守卫接入未破坏现有任何用例。

- [ ] **Step 9: Commit**

```bash
git add src/lib/tournament/guards.ts src/lib/tournament/guards.test.ts \
  src/lib/tournament/groups-service.ts src/lib/tournament/bracket-service.ts \
  src/lib/tournament/schedule-service.ts src/lib/tournament/score-service.ts
git commit -m "feat(tournament): archived-season read-only guards on all write services"
```

---

### Task 2: addCustomMatch SETUP 拒绝（TDD）

spec §2/§3：SETUP 期快照可被重建，自定义比赛会指向被移出/换组的队伍。service 硬拒绝 SETUP。

**Files:**
- Modify: `src/lib/tournament/schedule-service.ts`
- Modify: `src/lib/tournament/schedule-service.test.ts`

- [ ] **Step 1: 写失败测试** — 在 `schedule-service.test.ts` 末尾追加（顶部已 import createTournament/assignGroups/CFG/seed；本测试自建 SETUP 夹具，**不要 confirmGroups**）：

```ts
it('SETUP 期添加自定义比赛被拒', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  // 仍处于 SETUP（未 confirmGroups）
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: null,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: 'x', countsForStandings: false, actorUserId: 'u',
    }),
  ).rejects.toThrow(/分组确认前/);
});
```

> 注：本测试在 Task 5 会随其它 `createTournament` 调用一起迁移到 `createTestTournament`（夹具默认停在 SETUP，正合用）。这里先用 `createTournament` 写出红。

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/schedule-service.test.ts --project unit`
  Expected: FAIL（当前 SETUP 下有快照会进一步通过到创建，最终未抛 `/分组确认前/`）。

- [ ] **Step 3: 实现** — `addCustomMatch` 在 `if (t.status === 'FINISHED') ...` 之后插入：

```ts
  if (t.status === 'SETUP') throw new TournamentError('INVALID_STATE', '分组确认前不能添加自定义比赛');
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/schedule-service.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/schedule-service.ts src/lib/tournament/schedule-service.test.ts
git commit -m "feat(tournament): reject addCustomMatch in SETUP (snapshot rebuild safety)"
```

---

### Task 3: createTournamentShell + createSkeletonRecords helper（TDD）

把现 `createTournament` 的「阶段/组/淘汰赛/晋级边」落库块抽成 `createSkeletonRecords(tx, tournamentId, config)`；新 `createTournamentShell(db, {...})` 不建快照、不开自身事务（spec §3.1 契约）。

**Files:**
- Modify: `src/lib/tournament/tournament-service.ts`
- Create: `src/lib/tournament/shell.test.ts`

- [ ] **Step 1: 写失败测试** — `src/lib/tournament/shell.test.ts`：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournamentShell } from './tournament-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

it('shell 建骨架：2 阶段 / 2 组 / 3 淘汰赛 / 2 边 / 0 快照', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  const t = await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'S1', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
  expect(t.status).toBe('SETUP');
  expect(t.kind).toBe('正赛');
  expect(await testDb.tournamentStage.count({ where: { tournamentId: t.id } })).toBe(2);
  expect(await testDb.tournamentGroup.count()).toBe(2);
  expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
  expect(await testDb.matchAdvancementEdge.count()).toBe(2);
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
  expect(await testDb.auditLog.count({ where: { action: 'tournament.create' } })).toBe(1);
});

it('kind 透传（娱乐赛）', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  const t = await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'S1', kind: '娱乐赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
  expect(t.kind).toBe('娱乐赛');
});

it('同赛季重复创建被拒', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/已存在/);
});

it('赛季不存在被拒', async () => {
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId: 'nope', name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/赛季不存在/);
});

it('config 非法抛错', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: { template: 'group-knockout', groupCount: 0 } as never, actorUserId: 'u' }),
    ),
  ).rejects.toThrow();
});

it('归档赛季 shell 创建被拒', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/归档/);
});

it('调用方事务抛错时 shell 写入全部回滚（原子性）', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await expect(
    testDb.$transaction(async (tx) => {
      await createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' });
      throw new Error('boom');
    }),
  ).rejects.toThrow(/boom/);
  expect(await testDb.tournament.count()).toBe(0);
  expect(await testDb.tournamentStage.count()).toBe(0);
  expect(await testDb.match.count()).toBe(0);
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/shell.test.ts --project unit`
  Expected: FAIL（`createTournamentShell` 未导出 → import error）。

- [ ] **Step 3: 实现** — 在 `tournament-service.ts` 顶部增 import，并在 `createTournament` 之上插入 `createSkeletonRecords` + `createTournamentShell`。文件顶部 import 改为：

```ts
import type { PrismaClient, Tournament } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { Db, GroupKnockoutConfig } from './types';
```

在 `getTournamentBySeason` 之后、`createTournament` 之前插入：

```ts
/** 落库赛事骨架：阶段 + 组占位 + 淘汰赛空位对阵 + 晋级边（小组赛对阵在 confirmGroups 生成）。调用方保证在事务内。 */
export async function createSkeletonRecords(
  tx: Db,
  tournamentId: string,
  config: GroupKnockoutConfig,
): Promise<void> {
  const skeleton = groupKnockout.generate(config.groupCount * config.teamsPerGroup, config);
  const matchIdByKey = new Map<string, string>();
  for (const stage of skeleton.stages) {
    const st = await tx.tournamentStage.create({
      data: { tournamentId, type: stage.type, name: stage.name, order: stage.order, bestOf: stage.bestOf },
    });
    for (const g of stage.groups) {
      await tx.tournamentGroup.create({ data: { stageId: st.id, name: g.name } });
    }
    if (stage.type !== 'KNOCKOUT') continue;
    for (const m of stage.matches) {
      const created = await tx.match.create({
        data: { tournamentId, stageId: st.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf },
      });
      matchIdByKey.set(m.key, created.id);
    }
  }
  for (const e of skeleton.edges) {
    await tx.matchAdvancementEdge.create({
      data: {
        fromMatchId: matchIdByKey.get(e.fromKey)!,
        toMatchId: matchIdByKey.get(e.toKey)!,
        outcome: e.outcome,
        slot: e.slot,
      },
    });
  }
}

/**
 * 建 Tournament(SETUP) + 骨架（不建参赛队快照——快照在 assignGroups 重建）。
 * spec §3.1 契约：第一参数 Db，**自身不开 $transaction**，由调用方保证原子性。
 */
export async function createTournamentShell(
  db: Db,
  input: { seasonId: string; name: string; kind: string; config: GroupKnockoutConfig; actorUserId: string },
): Promise<Tournament> {
  const config = groupKnockout.validate(input.config);
  await assertSeasonWritableBySeasonId(db, input.seasonId); // 不存在 → SEASON_NOT_FOUND；归档 → INVALID_STATE
  if (await db.tournament.findUnique({ where: { seasonId: input.seasonId } }))
    throw new TournamentError('TOURNAMENT_EXISTS', '该赛季已存在赛事');

  const t = await db.tournament.create({
    data: { seasonId: input.seasonId, name: input.name, kind: input.kind, status: 'SETUP', config },
  });
  await createSkeletonRecords(db, t.id, config);
  await writeAudit(db, {
    userId: input.actorUserId,
    action: 'tournament.create',
    entity: 'Tournament',
    entityId: t.id,
    payload: { name: input.name, config: config as object },
  });
  return t;
}
```

> `createTournament`（旧）暂时保留（Task 5 退役）。`deleteTournament` 暂时保留（Task 6 退役）。两者仍用 `PrismaClient`，故顶部 import 保留 `PrismaClient`。

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/shell.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/tournament-service.ts src/lib/tournament/shell.test.ts
git commit -m "feat(tournament): createTournamentShell + createSkeletonRecords (no own tx, no snapshot)"
```

---

### Task 4: assignGroups 重建快照（TDD）

spec §2.2：SETUP 保存分组时，同事务**重建参赛队快照**（assignments 覆盖的 teamId 即参赛队集合，校验 ∈ season），先删旧快照再按当前 TeamSlot 重建。把队伍归属校验从「快照」改为「赛季」。

**Files:**
- Modify: `src/lib/tournament/groups-service.ts`
- Modify: `src/lib/tournament/groups-service.test.ts`

- [ ] **Step 1: 迁移 groups-service.test.ts setup 为 shell-only，并写新用例**

把顶部 `import { createTournament } from './tournament-service';` 删除，改 `import { createTestTournament } from './test-fixtures';`（Task 5 提供）。`setup()` 改为：

```ts
async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  return { t, teamIds, groups };
}
```

跨赛事用例（`assignGroups 跨赛事 groupId 被拒...`）里的两处 `createTournament(testDb, { seasonId..., name..., teamIds..., config, actorUserId })` 改为 `createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' })`。

追加新用例（验证「保存即建快照」「重存覆盖」「季外拒绝」）：

```ts
it('assignGroups 保存即重建参赛队快照（8 队 × 1 人）', async () => {
  const { t, teamIds, groups } = await setup();
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
  expect(await testDb.tournamentTeamPlayer.count()).toBe(8);
});

it('重新保存不同分组：快照被覆盖（仍 8 队，无残留）', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: [teamIds[4], teamIds[1], teamIds[2], teamIds[3]] },
      { groupId: groups[1].id, teamIds: [teamIds[0], teamIds[5], teamIds[6], teamIds[7]] },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
  expect(await testDb.tournamentGroupTeam.count()).toBe(8);
});

it('季外队伍分组被拒，快照不被污染', async () => {
  const { t, teamIds, groups } = await setup();
  const other = await seedSeasonWithTeams(1);
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: [other.teamIds[0], teamIds[1], teamIds[2], teamIds[3]] },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/不属于该赛季/);
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/groups-service.test.ts --project unit`
  Expected: FAIL（`createTestTournament` 未导出；且旧 assignGroups 按快照校验，shell 无快照 → 全部 `不在参赛名单`）。

- [ ] **Step 3: 实现** — 改写 `groups-service.ts` 的 `assignGroups`。完整新版（`confirmGroups` 不变，仅保留 Task 1 已加的守卫行）：

```ts
import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { GroupKnockoutConfig } from './types';

export async function assignGroups(
  db: PrismaClient,
  input: {
    tournamentId: string;
    assignments: Array<{ groupId: string; teamIds: string[] }>;
    actorUserId: string;
  },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许调整分组');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  // 本赛事的合法 groupId 集合
  const ownGroups = await db.tournamentGroup.findMany({
    where: { stage: { tournamentId: input.tournamentId } },
    select: { id: true },
  });
  const ownGroupIds = new Set(ownGroups.map((g) => g.id));

  // 分组归属 / 不重复 / 全覆盖
  const seenGroupIds = new Set<string>();
  for (const a of input.assignments) {
    if (!ownGroupIds.has(a.groupId)) throw new TournamentError('VALIDATION', '分组不属于该赛事');
    if (seenGroupIds.has(a.groupId)) throw new TournamentError('VALIDATION', '分组重复');
    seenGroupIds.add(a.groupId);
  }
  if (seenGroupIds.size !== ownGroupIds.size) throw new TournamentError('VALIDATION', '有分组未覆盖');

  const cfg = t.config as GroupKnockoutConfig;

  // 覆盖到的全部 teamId = 参赛队集合
  const allTeamIds: string[] = [];
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (a.teamIds.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `每组 ${cfg.teamsPerGroup} 支队伍`);
    for (const id of a.teamIds) {
      if (seen.has(id)) throw new TournamentError('VALIDATION', '队伍重复分组');
      seen.add(id);
      allTeamIds.push(id);
    }
  }
  if (allTeamIds.length !== cfg.groupCount * cfg.teamsPerGroup)
    throw new TournamentError('VALIDATION', '参赛队数量不符');

  // 校验全部属于该赛季，并取当前 TeamSlot 占用者作为快照 players
  const teams = await db.team.findMany({
    where: { id: { in: allTeamIds } },
    include: { slots: { where: { registrationId: { not: null } } } },
  });
  if (teams.length !== allTeamIds.length || teams.some((x) => x.seasonId !== t.seasonId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '存在不属于该赛季的队伍');

  await db.$transaction(async (tx) => {
    // 重建参赛队快照（删旧 → 按当前 slots 重建）
    await tx.tournamentTeam.deleteMany({ where: { tournamentId: t.id } });
    for (const team of teams) {
      await tx.tournamentTeam.create({
        data: {
          tournamentId: t.id,
          teamId: team.id,
          players: {
            create: team.slots
              .filter((s) => s.registrationId)
              .map((s) => ({ registrationId: s.registrationId! })),
          },
        },
      });
    }

    // 重写分组成员
    await tx.tournamentGroupTeam.deleteMany({ where: { group: { stage: { tournamentId: t.id } } } });
    for (const a of input.assignments) {
      for (const teamId of a.teamIds) {
        await tx.tournamentGroupTeam.create({ data: { groupId: a.groupId, teamId } });
      }
    }

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.groups.assign',
      entity: 'Tournament',
      entityId: t.id,
    });
  });
}
```

> 注：原 assignGroups 用 `include: { teams: true }` 取快照；新版不再需要——改为 `findUnique({ where: { id } })`。`confirmGroups` 仍 include stages（不动）。

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/groups-service.test.ts --project unit`
  Expected: PASS（需 Task 5 夹具就绪；若按编号执行，先做 Task 5 Step 1 再回跑）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/groups-service.ts src/lib/tournament/groups-service.test.ts
git commit -m "feat(tournament): assignGroups rebuilds team snapshot from season + current slots"
```

---

### Task 5: createTournament 退役 + fixtures 迁移（TDD 红改绿）

新增 `createTestTournament` 夹具（shell-only，停在 SETUP，不调 assignGroups——既有 setup 各自保留自己的 assignGroups）；把全部测试从 `createTournament` 迁移；删除 `createTournament` 及其专属测试（`shell.test.ts` 已覆盖 shell 行为）。`deleteTournament` 退役在 Task 6。

**Files:**
- Modify: `src/lib/tournament/test-fixtures.ts`
- Modify: `src/lib/tournament/tournament-service.ts`（删 createTournament）
- Modify: `src/lib/tournament/tournament-service.test.ts`（删 createTournament 用例，保留 deleteTournament 用例至 Task 6）
- Modify: `src/lib/tournament/score-service.test.ts`、`bracket-service.test.ts`、`schedule-service.test.ts`、`integration.test.ts`（import + setup 迁移）

- [ ] **Step 1: 写夹具 createTestTournament** — `test-fixtures.ts` 顶部加 import，并在 `CFG_2x4x2` 之前追加：

```ts
import { testDb } from '@/lib/test/db';
import { createTournamentShell } from './tournament-service';
import type { GroupKnockoutConfig } from './types';
```

```ts
/**
 * 测试夹具：在事务内建赛事骨架（SETUP，无快照），返回 Tournament。
 * 不调用 assignGroups——各测试 setup 自行分组/确认，保持与原流程一致（最小改动）。
 */
export async function createTestTournament(
  db: typeof testDb,
  input: { seasonId: string; teamIds: string[]; config: GroupKnockoutConfig; actorUserId?: string },
) {
  return db.$transaction((tx) =>
    createTournamentShell(tx, {
      seasonId: input.seasonId,
      name: 'x',
      kind: '正赛',
      config: input.config,
      actorUserId: input.actorUserId ?? 'u',
    }),
  );
}
```

> `teamIds` 入参保留以兼容调用签名（夹具本身不消费它；调用方仍用自己的 teamIds 调 assignGroups）。

- [ ] **Step 2: 迁移测试 import + setup**

逐文件替换：
- `score-service.test.ts`：`import { createTournament } from './tournament-service';` → `import { createTestTournament } from './test-fixtures';`（注意：CFG/seed 已从 `./test-fixtures` import，合并到同一行或保留两行均可）；`setupGroupStage` 内 `const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });` → `const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });`（后续 assignGroups/confirmGroups 不变）。
- `bracket-service.test.ts`：同样替换 import 与 `setup()` 内 createTournament 调用。
- `schedule-service.test.ts`：替换 import 与 `setup()` 内调用；Task 2 新增的 SETUP 用例里 `createTournament` 也改为 `createTestTournament`。
- `integration.test.ts`：本任务**先**把它的 `createTournament` 调用改为 `createTestTournament` 让其变绿（最小迁移：import 改 `createTestTournament`，`const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });`）。Task 11 再升级为 createSeason 入口。
- `groups-service.test.ts`：已在 Task 4 迁移。
- `guards.test.ts`：已用 `createTestTournament`。

- [ ] **Step 3: 删除 createTournament + 其专属测试**

`tournament-service.ts`：删除 `createTournament` 整个函数（保留 `getTournamentBySeason`、`createSkeletonRecords`、`createTournamentShell`、`deleteTournament`）。`PrismaClient` import 仍被 `deleteTournament` 使用，保留至 Task 6。

`tournament-service.test.ts`：删除整个 `describe('createTournament', ...)` 块（shell.test.ts 已覆盖）。保留 `describe('deleteTournament', ...)`，其 `createTournament(...)` 调用改为 `createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' })`；import 改为 `import { deleteTournament, getTournamentBySeason } from './tournament-service';` + `import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';`。

- [ ] **Step 4: Run 全量 tournament 套件确认绿** — `npx vitest run src/lib/tournament --project unit`
  Expected: PASS（guards/shell/groups/score/bracket/schedule/integration 全绿；createTournament 用例已移除；guards.test.ts 此时夹具就绪应 PASS）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament
git commit -m "test(tournament): migrate fixtures to createTestTournament; retire createTournament"
```

---

### Task 6: updateTournamentConfig + resetTournament，deleteTournament 退役（TDD）

spec §3.2。共享 `clearTournamentStructure(tx, tournamentId)`。

**Files:**
- Modify: `src/lib/tournament/tournament-service.ts`
- Modify: `src/lib/tournament/tournament-service.test.ts`

- [ ] **Step 1: 写失败测试** — `tournament-service.test.ts` 整体替换为（删除 deleteTournament describe，换为 update/reset）：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import {
  getTournamentBySeason,
  resetTournament,
  updateTournamentConfig,
} from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

/** 建赛事 + 分组 + 确认 → GROUP_STAGE。 */
async function toGroupStage() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
  return { seasonId, teamIds, t };
}

describe('updateTournamentConfig', () => {
  it('SETUP：改 config 重建骨架并清空快照/分组', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
    await assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    });
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);

    // 改为 4 组 × 2 队 × 1 出线（出线 4 → SF/FINAL）
    const newCfg = {
      template: 'group-knockout' as const,
      groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 1,
      groupBestOf: 1 as const, knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
    };
    await updateTournamentConfig(testDb, { tournamentId: t.id, config: newCfg, actorUserId: 'u' });

    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect((after.config as typeof newCfg).groupCount).toBe(4);
    expect(after.status).toBe('SETUP');
    expect(await testDb.tournamentGroup.count()).toBe(4);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0); // 快照清空
    expect(await testDb.tournamentGroupTeam.count()).toBe(0); // 分组清空
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3); // 新骨架 SF×2 + FINAL
    expect(await testDb.auditLog.count({ where: { action: 'tournament.config.update' } })).toBe(1);
  });

  it('非 SETUP：改 config 被拒，但改 kind 允许', async () => {
    const { t } = await toGroupStage();
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, config: CFG_2x4x2, actorUserId: 'u' }),
    ).rejects.toThrow(/SETUP|状态/);
    await updateTournamentConfig(testDb, { tournamentId: t.id, kind: '娱乐赛', actorUserId: 'u' });
    expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.kind).toBe('娱乐赛');
  });

  it('FINISHED：改 name/kind 也被拒', async () => {
    const { t } = await toGroupStage();
    await testDb.tournament.update({ where: { id: t.id }, data: { status: 'FINISHED' } });
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, name: 'x2', actorUserId: 'u' }),
    ).rejects.toThrow(/结束|FINISHED|状态/);
  });

  it('归档赛季：改配置被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, kind: '娱乐赛', actorUserId: 'u' }),
    ).rejects.toThrow(/归档/);
  });
});

describe('resetTournament', () => {
  it('从 KNOCKOUT（含已录局）重置 → SETUP，骨架重建，快照/分组/比分清空', async () => {
    const { t, teamIds } = await toGroupStage();
    for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
      const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
      const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
      await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
    }
    await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
    expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');

    await resetTournament(testDb, { tournamentId: t.id, actorUserId: 'u' });

    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect(after.status).toBe('SETUP');
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3); // 仅 KO 骨架
    expect(await testDb.match.count({ where: { groupId: { not: null } } })).toBe(0);
    expect(await testDb.game.count()).toBe(0);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.tournamentGroupTeam.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: 'tournament.reset' } })).toBe(1);
    expect(await getTournamentBySeason(testDb, t.seasonId)).not.toBeNull(); // 赛事仍在
  });

  it('归档赛季：重置被拒', async () => {
    const { seasonId, t } = await toGroupStage();
    await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await expect(resetTournament(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/归档/);
  });
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/tournament-service.test.ts --project unit`
  Expected: FAIL（`updateTournamentConfig` / `resetTournament` 未导出）。

- [ ] **Step 3: 实现** — `tournament-service.ts`：删除 `deleteTournament`，新增 `clearTournamentStructure` + 两个新函数。`PrismaClient` import 退役后不再需要——顶部 import 收敛为：

```ts
import type { Tournament } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { Db, GroupKnockoutConfig } from './types';
```

在 `createSkeletonRecords` 之后、`createTournamentShell` 之后插入（顺序：…shell → clearTournamentStructure → updateTournamentConfig → resetTournament）：

```ts
/** 清空赛事结构：阶段（级联组/组队/比赛→局/edges）+ 参赛队快照。调用方保证在事务内。 */
export async function clearTournamentStructure(tx: Db, tournamentId: string): Promise<void> {
  await tx.tournamentStage.deleteMany({ where: { tournamentId } }); // 级联 groups/groupTeams/matches/games/edges
  await tx.tournamentTeam.deleteMany({ where: { tournamentId } });
}

/**
 * 修改赛事配置。
 * - name/kind：status ≠ FINISHED 可改。
 * - config：仅 status = SETUP；清空结构后按新 config 重建骨架（快照同被清空）。
 */
export async function updateTournamentConfig(
  db: Db,
  input: { tournamentId: string; name?: string; kind?: string; config?: GroupKnockoutConfig; actorUserId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  const wantsName = input.name !== undefined;
  const wantsKind = input.kind !== undefined;
  const wantsConfig = input.config !== undefined;

  if ((wantsName || wantsKind) && t.status === 'FINISHED')
    throw new TournamentError('INVALID_STATE', '赛事已结束，不能修改');
  if (wantsConfig && t.status !== 'SETUP')
    throw new TournamentError('INVALID_STATE', '仅 SETUP 状态可修改赛制配置');

  const validated = wantsConfig ? groupKnockout.validate(input.config!) : null;

  return db.$transaction(async (tx) => {
    if (validated) {
      await clearTournamentStructure(tx, input.tournamentId);
      await createSkeletonRecords(tx, input.tournamentId, validated);
    }
    const updated = await tx.tournament.update({
      where: { id: input.tournamentId },
      data: {
        ...(wantsName ? { name: input.name } : {}),
        ...(wantsKind ? { kind: input.kind } : {}),
        ...(validated ? { config: validated } : {}),
      },
    });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.config.update',
      entity: 'Tournament',
      entityId: input.tournamentId,
      payload: {
        ...(wantsName ? { name: input.name } : {}),
        ...(wantsKind ? { kind: input.kind } : {}),
        ...(validated ? { config: validated as object } : {}),
      },
    });
    return updated;
  });
}

/** 重置赛事：清空结构 + 比分 → 按当前 config 重建骨架 → status 回 SETUP。 */
export async function resetTournament(
  db: Db,
  input: { tournamentId: string; actorUserId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);
  const config = groupKnockout.validate(t.config);

  return db.$transaction(async (tx) => {
    await clearTournamentStructure(tx, input.tournamentId);
    await createSkeletonRecords(tx, input.tournamentId, config);
    const updated = await tx.tournament.update({
      where: { id: input.tournamentId },
      data: { status: 'SETUP' },
    });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.reset',
      entity: 'Tournament',
      entityId: input.tournamentId,
    });
    return updated;
  });
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/tournament-service.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/tournament-service.ts src/lib/tournament/tournament-service.test.ts
git commit -m "feat(tournament): updateTournamentConfig + resetTournament; retire deleteTournament"
```

---

### Task 7: createSeason 扩展（TDD）

spec §3.1：`CreateSeasonInput` 增必填 `tournament`；`createSeason(db, input, actorUserId)` 事务内 season.create 后调 `createTournamentShell`。

**Files:**
- Modify: `src/lib/season/season-schema.ts`
- Modify: `src/lib/season/season-service.ts`
- Create: `src/lib/season/season-tournament.test.ts`
- Modify: `src/lib/season/season-service.test.ts`（既有 createSeason 调用补 tournament 字段 + actorUserId）
- Modify: `src/app/api/seasons/route.ts`（透传 actorUserId）

- [ ] **Step 1: 扩展 schema** — `season-schema.ts`：

```ts
import { z } from 'zod';

export const CreateSeasonInput = z.object({
  name: z.string().trim().min(1, '赛季名称必填').max(40, '赛季名称过长'),
  teamBudget: z.number().positive('预算必须大于 0'),
  tournament: z.object({
    name: z.string().trim().min(1).max(60).optional(),
    kind: z.string().trim().min(1).max(20),
    config: z.object({}).passthrough(),
  }),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonInput>;

export const UpdateSeasonInput = z.object({
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type UpdateSeasonInput = z.infer<typeof UpdateSeasonInput>;
```

- [ ] **Step 2: 写失败测试** — `src/lib/season/season-tournament.test.ts`：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createSeason, getActiveSeason } from './season-service';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

beforeEach(resetDb);

const TOURNAMENT = { kind: '正赛', config: CFG_2x4x2 };

it('建赛季同事务建赛事骨架（season + tournament + 骨架）', async () => {
  const season = await createSeason(
    testDb,
    { name: 'S1', teamBudget: 1000, tournament: TOURNAMENT },
    'admin-1',
  );
  expect(season.status).toBe('SETUP');
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  expect(t).not.toBeNull();
  expect(t.name).toBe('S1'); // tournament.name 缺省 = 赛季名
  expect(t.kind).toBe('正赛');
  expect(await testDb.tournamentStage.count({ where: { tournamentId: t.id } })).toBe(2);
  expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
  expect(await testDb.tournamentTeam.count()).toBe(0);
});

it('tournament.name 覆盖赛季名', async () => {
  const season = await createSeason(
    testDb,
    { name: 'S1', teamBudget: 1000, tournament: { name: '夏季正赛', kind: '正赛', config: CFG_2x4x2 } },
    'admin-1',
  );
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  expect(t.name).toBe('夏季正赛');
});

it('config 非法 → 整体回滚（无 season 行）', async () => {
  await expect(
    createSeason(
      testDb,
      { name: 'S1', teamBudget: 1000, tournament: { kind: '正赛', config: { template: 'group-knockout', groupCount: 0 } } },
      'admin-1',
    ),
  ).rejects.toThrow();
  expect(await testDb.season.count()).toBe(0);
  expect(await testDb.tournament.count()).toBe(0);
});

it('建新赛季归档旧活跃赛季', async () => {
  const first = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: TOURNAMENT }, 'u');
  await createSeason(testDb, { name: 'S2', teamBudget: 1000, tournament: TOURNAMENT }, 'u');
  expect((await testDb.season.findUnique({ where: { id: first.id } }))!.status).toBe('ARCHIVED');
  expect((await getActiveSeason(testDb))?.name).toBe('S2');
});
```

- [ ] **Step 3: Run 确认 FAIL** — `npx vitest run src/lib/season/season-tournament.test.ts --project unit`
  Expected: FAIL（createSeason 签名缺 actorUserId、不建赛事）。

- [ ] **Step 4: 实现** — `season-service.ts` 改 `createSeason`，顶部加 import：

```ts
import { createTournamentShell } from '@/lib/tournament/tournament-service';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';
```

```ts
export async function createSeason(
  db: PrismaClient,
  input: CreateSeasonInput,
  actorUserId: string,
): Promise<Season> {
  return db.$transaction(async (tx) => {
    await archiveActiveSeason(tx);
    const season = await tx.season.create({
      data: { name: input.name, teamBudget: input.teamBudget, status: 'SETUP' },
    });
    await createTournamentShell(tx, {
      seasonId: season.id,
      name: input.tournament.name ?? input.name,
      kind: input.tournament.kind,
      config: input.tournament.config as GroupKnockoutConfig, // passthrough → cast；shell 内 validate
      actorUserId,
    });
    return season;
  });
}
```

- [ ] **Step 5: 修既有 season-service.test.ts** — 所有 `createSeason(testDb, { name: ..., teamBudget: ... })` 调用补 `tournament` 字段与 actorUserId。顶部加 `import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';`，定义 `const T = { kind: '正赛', config: CFG_2x4x2 };`，把每处调用改为 `createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u')`（含 create/get/list、transitions、updateSeasonBudget describe 内全部 setup；约 12 处）。断言不变。

- [ ] **Step 6: 更新路由** — `src/app/api/seasons/route.ts` 的 POST：`const season = await createSeason(prisma, parsed.data, guard.session.user.id);`（`requireAdmin` 成功分支返回 `{ session }`，`guard.session.user.id` 即操作者）。

- [ ] **Step 7: Run 确认 PASS** — `npx vitest run src/lib/season --project unit`
  Expected: PASS（season-tournament.test.ts + season-service.test.ts + season-schema.test.ts 全绿）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/season src/app/api/seasons/route.ts
git commit -m "feat(season): createSeason builds tournament shell atomically (required config)"
```

---

### Task 8: 路由改造（admin POST→shell / DELETE 移除 / PATCH 新增 / reset 新增）

spec §4。

**Files:**
- Modify: `src/app/api/tournament/admin/route.ts`
- Create: `src/app/api/tournament/admin/reset/route.ts`

- [ ] **Step 1: 重写 admin/route.ts** — 完整新版：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { createTournamentShell, updateTournamentConfig } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

const createSchema = z.object({
  seasonId: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  config: z.object({}).passthrough(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = createSchema.parse(await req.json());
    await prisma.$transaction((tx) =>
      createTournamentShell(tx, {
        seasonId: body.seasonId,
        name: body.name,
        kind: body.kind,
        config: body.config as GroupKnockoutConfig,
        actorUserId: guard.session.user.id,
      }),
    );
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const patchSchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  config: z.object({}).passthrough().optional(),
});

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = patchSchema.parse(await req.json());
    await updateTournamentConfig(prisma, {
      tournamentId: body.tournamentId,
      name: body.name,
      kind: body.kind,
      config: body.config as GroupKnockoutConfig | undefined,
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

（删除 DELETE handler 与 deleteSchema。`createTournamentShell` 不自带事务，故路由包 `prisma.$transaction`。）

- [ ] **Step 2: 新增 reset 路由** — `src/app/api/tournament/admin/reset/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { resetTournament } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const schema = z.object({ tournamentId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = schema.parse(await req.json());
    await resetTournament(prisma, { tournamentId: body.tournamentId, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
```

- [ ] **Step 3: typecheck + lint + 全量套件** — `npm run typecheck && npx next lint && npx vitest run --project unit`
  Expected: 全 PASS（路由不在 unit 套件，但 typecheck 覆盖签名一致性）。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournament/admin/route.ts src/app/api/tournament/admin/reset/route.ts
git commit -m "feat(tournament): admin route → shell POST, drop DELETE, add PATCH + reset"
```

---

### Task 9: UI — TournamentConfigForm 抽取 + SeasonManager 赛事区块

spec §5。把 SetupTab 的配置表单抽成受控组件，供 SeasonManager 与 SetupTab 共用。

**Files:**
- Create: `src/components/admin/tournament/TournamentConfigForm.tsx`
- Modify: `src/components/admin/SeasonManager.tsx`

实现要点（复用现有 `Input`/`Label`/`Select`/`Button`/`sonner`）：

- [ ] **Step 1: `TournamentConfigForm`** — 受控、无提交按钮（父组件 owns submission）。

  - **导出类型**：
    ```ts
    export type TournamentConfigValue = {
      name: string;
      kind: string;          // 已解析（自定义已展开为文本），父组件直接用作 kind
      config: GroupKnockoutConfig;
    };
    ```
  - **Props**：`{ value: TournamentConfigValue; onChange: (v: TournamentConfigValue) => void; onValidityChange?: (valid: boolean) => void; showNameField?: boolean; showStructure?: boolean }`。`showStructure` 默认 true；SetupTab 非 SETUP 编辑时传 false（仅 name/kind）。
  - **内部状态**：把 SetupTab 现有的 `kindSelect`/`kindCustom`/`groupCount`/`teamsPerGroup`/`advancingPerGroup`/`groupBestOf`/`knockoutBestOf` 逻辑搬入；初值从 `value` 反解（kind 命中 KIND_OPTIONS 则置 select，否则置 `__custom__` + kindCustom = kind；config 字段铺开）。每次变化通过 `onChange` 回传组装好的 `{ name, kind, config }`（config = `{ template:'group-knockout', groupCount, teamsPerGroup, advancingPerGroup, groupBestOf, knockoutBestOf: koBoMap }`）。
  - **校验**：复用 `totalAdvancing`/`roundKeys`/`isPowerOfTwo`；**移除参赛队相关校验**（绑队已不在创建期）。validity = `kind 非空 && advancingOk && roundKeys.length > 0 && (showNameField ? name.trim() 非空 : true)`，经 `onValidityChange` 上抛（`useEffect` 依赖变化时回调）。
  - **渲染**：`showNameField` 为 true 时渲染赛事名 Input（id `t-name`）；类别 Select（KIND_OPTIONS，含「自定义」展开文本框）；`showStructure` 为 true 时渲染组数/每组队数/每组出线数（id `t-groups`/`t-tpg`/`t-apg`）+ 小组 BO Select + 淘汰赛各轮 BO（按 roundKeys 动态）。**不渲染**参赛队 Checkbox、不渲染任何提交按钮。出线总数非法时红字提示（沿用 SetupTab 文案）。
  - 顶部声明 `ROUND_KEYS_FOR_ADVANCING`、`KIND_OPTIONS`、`isPowerOfTwo`（从 SetupTab 移来）。

- [ ] **Step 2: SeasonManager 加「赛事设置」区块**

  - 顶部 `import { TournamentConfigForm, type TournamentConfigValue } from './tournament/TournamentConfigForm';`；定义 `const DEFAULT_TCFG: TournamentConfigValue = { name: '', kind: '正赛', config: { template: 'group-knockout', groupCount: 2, teamsPerGroup: 4, advancingPerGroup: 2, groupBestOf: 1, knockoutBestOf: { SF: 3, FINAL: 5 } } };`
  - 状态：`const [tcfg, setTcfg] = useState<TournamentConfigValue>(DEFAULT_TCFG); const [tcfgValid, setTcfgValid] = useState(false); const [tnameEdited, setTnameEdited] = useState(false);`
  - **赛事名跟随赛季名**：赛季名 Input onChange 改为 `(e) => { const v = e.target.value; setName(v); if (!tnameEdited) setTcfg((p) => ({ ...p, name: v })); }`。TournamentConfigForm 的 name input 一旦被用户改动则 `setTnameEdited(true)`——实现：包一层 `onChange`，比对新 name 与「当前应跟随的赛季名」，不同则视为用户编辑。简化实现：给 TournamentConfigForm 的赛事名 Input 一个 `onFocus`/`onChange` 标记是用户主动改（在 SeasonManager 侧无法直接拿到，故 TournamentConfigForm 可接受可选 `onNameUserEdit?: () => void`，SeasonManager 传 `() => setTnameEdited(true)`）。
  - 在 create-season 表单（现 `name`/`teamBudget` 行）下方插入「赛事设置」标题 + `<TournamentConfigForm value={tcfg} onChange={setTcfg} onValidityChange={setTcfgValid} showNameField onNameUserEdit={() => setTnameEdited(true)} />`。
  - **提交**：`doCreate` 的 body 改为
    ```ts
    body: JSON.stringify({
      name, teamBudget: Number(teamBudget),
      tournament: { name: tcfg.name || undefined, kind: tcfg.kind, config: tcfg.config },
    })
    ```
    成功后 `setTcfg(DEFAULT_TCFG); setTnameEdited(false);` 一并重置。
  - 提交按钮 `disabled={submitting || !tcfgValid || !name.trim() || !teamBudget}`。归档确认 AlertDialog 流程不变。

- [ ] **Step 3: 手动验收** — `npm run dev` → 赛季管理：填赛季名（赛事名自动跟随）、预算、赛制（默认 2×4×2）→ 新建赛季 → DB 出现 season + tournament + 骨架（验证：`/admin/tournament` 切到该赛季显示「当前赛事」摘要）。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/tournament/TournamentConfigForm.tsx src/components/admin/SeasonManager.tsx
git commit -m "feat(season): SeasonManager tournament config block via shared TournamentConfigForm"
```

---

### Task 10: UI — SetupTab / GroupsTab / ScheduleTab 改造

spec §5。

**Files:**
- Modify: `src/components/admin/tournament/SetupTab.tsx`
- Modify: `src/components/admin/tournament/GroupsTab.tsx`
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`

实现要点：

- [ ] **Step 1: SetupTab — 有赛事视图**

  - 重写 SetupTab：删除内联配置表单与参赛队 Checkbox（移到 TournamentConfigForm），删除 `selectedTeamIds`/`toggleTeam`/`handleDelete`/`deleting`。引入 `TournamentConfigForm` + `useState<TournamentConfigValue>`。
  - **配置摘要**（保留现有「当前赛事」name/kind/status 块）。
  - **SETUP 时「修改配置」**：渲染 `TournamentConfigForm`（`showNameField` + `showStructure`，初值由 `state.tournament` 的 name/kind/config 解析填充），下方「保存配置」按钮 → 提交前 `window.confirm('修改赛制将清空已保存的分组与参赛名单，确定继续？')`，确认后 `PATCH /api/tournament/admin` body `{ tournamentId, name, kind, config }`。成功 toast + refetch。
  - **非 SETUP（GROUP_STAGE/KNOCKOUT）时**：渲染 `TournamentConfigForm` 传 `showNameField` 且 `showStructure={false}`（仅 name/kind），「保存」→ `PATCH` 仅带 `{ tournamentId, name, kind }`。FINISHED 时禁用编辑（只读摘要，不渲染表单）。
  - **危险区「重置赛事」**（替换原「删除赛事」）：两步确认——`window.confirm('重置将清空全部比赛/分组/比分并回到设置状态，确定继续？')` 后 `window.prompt('请输入赛事名称确认重置：「{name}」')`，匹配则 `POST /api/tournament/admin/reset` body `{ tournamentId }`。成功 toast「赛事已重置」+ refetch。

- [ ] **Step 2: SetupTab — 无赛事（老赛季 fallback）视图**

  - 保留创建表单，但**用 `TournamentConfigForm`（`showNameField` + `showStructure`）替换内联字段并移除参赛队 Checkbox 列表**。提交 → `POST /api/tournament/admin` body `{ seasonId, name, kind, config }`（**无 teamIds**）。成功 toast + refetch。
  - `Props` 中 `teams` 可移除（SetupTab 自身不再用；GroupsTab/ScheduleTab 仍各自从 TournamentAdmin 拿 teams）。若移除，同步改 `TournamentAdmin.tsx` 的 `<SetupTab>` 不传 `teams`，并改 `SetupTab` Props 类型。

- [ ] **Step 3: GroupsTab — 选项来自全赛季队伍**

  - 现已通过 `teams` prop 接收全赛季队伍（`page.tsx` 的 `teamList`）。**改动点**：SETUP 时每组 Select 选项已用 `teams`（全赛季）——确认 `pickedExcluding`/`availableTeams` 逻辑保留即可；`groupCount`/`teamsPerGroup` 仍从 `config` 取（已实现）。
  - **保存分组即圈定参赛队**：无需 UI 改动（assignGroups 后端已重建快照）。保存/确认按钮与端点不变（`PUT`/`POST /api/tournament/admin/groups`）。
  - 验证：新赛季初始 `standings` 为空（无快照），SETUP 分支用 `Array.from({length: groupCount})` 渲染空槽——确认 `useEffect`（standings 为空时填空槽）逻辑保留。本任务 GroupsTab 实质无代码改动，仅回归验证；若验证通过则该文件可不在本任务 commit。

- [ ] **Step 4: ScheduleTab — SETUP 隐藏「+ 自定义比赛」**

  - 顶部操作栏「+ 自定义比赛」按钮加条件：`{tournament.status !== 'SETUP' && (<Button ...>自定义比赛</Button>)}`。（后端 Task 2 已硬拒绝 SETUP，UI 同步隐藏。）其余不变。

- [ ] **Step 5: typecheck + lint + 手动 smoke** — `npm run typecheck && npx next lint`；`npm run dev` 走：老赛季 fallback 建赛事 → 分组（全赛季队伍选项）→ 确认 → 录分；SETUP 改配置（确认清空提示）；危险区重置。

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/tournament/SetupTab.tsx src/components/admin/tournament/ScheduleTab.tsx \
  src/components/admin/tournament/GroupsTab.tsx src/components/admin/tournament/TournamentAdmin.tsx
git commit -m "feat(tournament): SetupTab config edit/reset, hide custom-match in SETUP, season-wide group options"
```

---

### Task 11: 集成 / E2E / 回归

spec §7。集成入口改为「建赛季（带配置）」，但 teams 需要赛季——抽 `seedTeamsForSeason` 复用既有造队逻辑。

**Files:**
- Modify: `src/lib/tournament/test-fixtures.ts`（抽 `seedTeamsForSeason`）
- Modify: `src/lib/tournament/integration.test.ts`（createSeason 入口）
- Modify: `scripts/e2e-tournament.spec.ts`（清理步骤 / 创建步骤）

- [ ] **Step 1: 抽 seedTeamsForSeason** — `test-fixtures.ts`：把 `seedSeasonWithTeams` 的造队循环抽成可复用 helper，并让 `seedSeasonWithTeams` 复用它（保持现有签名/行为不变，避免破坏其它测试）：

```ts
/** 在已存在的 season 内造 n 支队（每队 1 队长报名 + user + 1 个占用 MID 的 slot），返回 teamIds。 */
export async function seedTeamsForSeason(seasonId: string, n: number): Promise<string[]> {
  const teamIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const player = await testDb.player.create({
      data: { gameId: `cap-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `队长${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId, playerId: player.id, nickname: `队长${i}`,
        primaryPositions: ['MID'], secondaryPositions: [],
        currentRank: 'GOLD', peakRank: 'PLATINUM', cost: 100,
        status: 'ACTIVE', isCaptain: true,
      },
    });
    const user = await testDb.user.create({
      data: { username: `cap-${i}-${seasonId.slice(-4)}-${Math.random().toString(36).slice(2, 6)}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const team = await testDb.team.create({
      data: { seasonId, name: `队伍${i}`, captainId: reg.id, userId: user.id },
    });
    await testDb.teamSlot.create({ data: { teamId: team.id, position: 'MID', registrationId: reg.id } });
    teamIds.push(team.id);
  }
  return teamIds;
}

export async function seedSeasonWithTeams(n: number) {
  const season = await testDb.season.create({
    data: { name: 'S-test', status: 'COMPLETED', teamBudget: 1000 },
  });
  const teamIds = await seedTeamsForSeason(season.id, n);
  return { seasonId: season.id, teamIds };
}
```

> username 加随机后缀以防 createSeason 流程下多次造队 username 冲突。

- [ ] **Step 2: 重写 integration.test.ts** — 入口 = `createSeason`（带 tournament 配置），再在该赛季造队，assignGroups → confirm → 录分 → 冠军 → 读模型。完整新版：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createSeason } from '@/lib/season/season-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { getPublicTournamentState } from './read-model';
import { CFG_2x4x2, seedTeamsForSeason } from './test-fixtures';

beforeEach(resetDb);

it('全流程：建赛季(带配置) → 造队 → 分组 → 确认 → 录分 → 冠军', async () => {
  const season = await createSeason(
    testDb,
    { name: 'S1', teamBudget: 1000, tournament: { kind: '正赛', config: CFG_2x4x2 } },
    'u',
  );
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  const teamIds = await seedTeamsForSeason(season.id, 8);

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

  const state = (await getPublicTournamentState(testDb, season.id))!;
  expect(state.matches.length).toBe(12 + 3);
  expect(state.standings).toHaveLength(2);
  expect(state.bracket.map((r) => r.roundKey)).toEqual(['SF', 'FINAL']);
});
```

> 注意：`createSeason` 内 `archiveActiveSeason` 后新 season.status = SETUP（活跃，非归档）——录分/分组守卫全部放行。

- [ ] **Step 3: Run 集成绿** — `npx vitest run src/lib/tournament/integration.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 4: 改 e2e-tournament.spec.ts**

  precise 改动（prose；推荐「reset 清理 + SETUP 直接分组」路径，改动最小）：
  - **Pre-check 清理（行 ~73-91）**：原「检测危险区→点『删除赛事』」改为「检测危险区→点『重置赛事』」。selector：`page.locator('button:has-text("重置赛事")')`；dialog handler 不变（confirm accept；prompt accept(tName)，其中 tName 仍从 `/api/tournament/public/state` 取 `state.tournament.name`）。点击后赛事被重置回 SETUP（**不再消失**），赛事仍存在。
  - **Step 2 创建（行 ~93-152）**：因 reset 后赛事已存在且为 SETUP，**跳过 fallback 创建表单**，直接 `nav` 到 `/admin/tournament` 进入分组流程。仅当当前赛季**确无赛事**（极老数据）时才走 SetupTab fallback 创建：此时**移除全部参赛队 checkbox 勾选逻辑**（删除行 ~131-142 的 `button[role="checkbox"]` 循环——创建期不再选队）；表单字段（赛事名/类别/组数/每组/出线/各轮 BO）selector id 不变（`#t-name`/`#t-groups`/`#t-tpg`/`#t-apg`），提交按钮文案仍「创建赛事」。
  - **Step 3 起（分组/录分/收小组/淘汰赛）**：步骤与 selector 保持不变（GroupsTab「随机分组」选项现来自全赛季队伍，行为一致）。
  - **断言保持**：FINAL 有 winner、status FINISHED 不变（行 ~456-457）。
  - 收尾注释（行 ~479）若提到「删除」字样改为「reset」语义描述。

- [ ] **Step 5: 全量回归 + 构建** — `npx vitest run && npm run typecheck && npm run build`
  Expected: exit 0。注意 lint error 会让 build 失败（先例见 M1 计划 Task 15：装饰性 `//` 文本要写 `{'//'}` 等）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/test-fixtures.ts src/lib/tournament/integration.test.ts scripts/e2e-tournament.spec.ts
git commit -m "test(tournament): integration via createSeason entry; e2e reset cleanup, no team picking"
```

---

## Spec 覆盖表（§ → Task）

| Spec § | 要求 | Task |
|---|---|---|
| §1 整合方式 / 1:1 / 必填赛事 / SETUP 可改 / 老数据 fallback | 决策记录 → 落地于服务+UI | 3,6,7,9,10 |
| §2.1 createTournamentShell（骨架先行，不建快照） | createSkeletonRecords + shell | 3 |
| §2.2 assignGroups 重建快照（含重复保存覆盖） | assignGroups 改造 | 4 |
| §2.2 快照一致性：addCustomMatch 拒绝 SETUP | service 硬拒绝 + UI 隐藏 | 2,10 |
| §2.3 createTournament 退役（shell+assignGroups 覆盖） | 退役 + 夹具迁移 | 5 |
| §3.1 createSeason 扩展（事务顺序 / 携带 actorUserId / shell 不开自身事务契约） | createSeason + shell 契约 | 3,7 |
| §3.2 updateTournamentConfig（name/kind/config 矩阵 + 重建 + 审计） | updateTournamentConfig | 6 |
| §3.2 resetTournament（清空 → 重建 → SETUP + 审计 + 两步确认 UI） | resetTournament + SetupTab | 6,10 |
| §3.2 deleteTournament + DELETE 路由移除（全调用方：service/路由/UI/测试/e2e） | 退役 | 6,8,10,11 |
| §3.4 归档赛季只读（两守卫变体 + 全写服务前置） | guards + 接入（shell/update/reset 守卫内嵌于 3/6） | 1,3,6 |
| §4 POST→shell / DELETE 移除 / PATCH 新增 / reset 新增 / seasons body 扩展 | 路由改造 + season schema | 7,8 |
| §5 TournamentConfigForm 抽取 + SeasonManager 区块（赛事名跟随） | UI 抽取 + 季管理 | 9 |
| §5 SetupTab 摘要/改配置/非SETUP仅name-kind/重置危险区/fallback 创建 | SetupTab 改造 | 10 |
| §5 GroupsTab 全赛季队伍选项 | GroupsTab 验证（无实质改动） | 10 |
| §6 零 schema 变更 | 无迁移（全计划遵守） | — |
| §7 season-service 原子性/回滚/归档测试 | season-tournament.test.ts | 7 |
| §7 tournament shell 完整性 / update 矩阵 / reset 测试 | shell.test.ts / tournament-service.test.ts | 3,6 |
| §7 groups assignGroups 重建快照 / 季外 / 数量测试 | groups-service.test.ts | 4 |
| §7 集成：建赛季(带配置)→冠军 | integration.test.ts | 11 |
| §7 createTournament 测试改造 / deleteTournament→reset | 测试迁移 | 5,6 |
| §7 归档只读矩阵（含 addCustomMatch/recordGame 等） | guards.test.ts | 1 |
| §7 addCustomMatch SETUP 拒绝 / GROUP_STAGE tiebreaker 仍通过 | schedule-service.test.ts | 2 |
| §7 E2E 清理步骤 删除→reset | e2e-tournament.spec.ts | 11 |
| §7 公开页空态语义不变（老赛季无赛事返回 null） | 不改读模型；fallback 老赛季保留 | 10（无回归） |
| §8 范围外（一季多赛事 / M2 / 生产迁移） | 不实现 | — |

---

## 实施顺序与依赖说明

- **Task 5 的 `createTestTournament` 是 Task 1/4 测试的前置依赖**。推荐实际执行顺序：Task 3（shell）→ Task 5 Step 1（夹具）→ Task 1（守卫+守卫测试）→ Task 2 → Task 4 → Task 5 余下（退役+迁移）→ Task 6 → 7 → 8 → 9 → 10 → 11。若严格按编号执行，Task 1/4 的「Run 确认 FAIL/PASS」步骤已注明需配合 Task 5 夹具，按各步骤内提示处理即可。
- 每个改服务的 Task 已把对应 `assertSeasonWritable*` 守卫一并写入（9 个既有写服务在 Task 1；shell 在 Task 3；update/reset 在 Task 6）。createSeason 入口的新赛季必非归档，由 shell 内部 `assertSeasonWritableBySeasonId` 统一覆盖，无需在 createSeason 另加守卫。合起来即 spec §3.4 的全量清单。
