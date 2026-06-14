# 赛季-赛事物理合一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 物理删除 Season 概念，把报名→选秀→组队→赛制全生命周期合并进单一 `Tournament` 实体，一条 9 态线性状态机，全量 `seasonId`→`tournamentId` 改名，destructive 重建数据库。

**Architecture:** 删 `seasons` 表与 `SeasonStatus`，字段并入 `tournaments`；`Registration`/`Team`/`DraftSession` 外键由 `seasonId` 改 `tournamentId`；`season-service` 退役、职能并入 `tournament-service`（含统一 `transitionTournament`）；所有反向排除状态判断改显式白名单；无数据保留，重置迁移基线 + 删库重建。

**Tech Stack:** Next.js (App Router) · TypeScript · Prisma · PostgreSQL · Vitest

**前置 spec:** `docs/superpowers/specs/2026-06-14-season-tournament-unify-design.md`（rev.3，codex PASS）

**执行须知（关键）：**
- 这是一次**原子重命名重构**：Task 1 改 schema 后全局 `tsc` 会红，属预期；构建在 Task 9 才整体转绿。每个 Task 末尾跑**该子系统自己的测试文件**验证，不依赖全局绿。
- **禁止全局 `sed` 机械替换状态名**——`season.status` 的语义按 spec §3.3 分类展开（COMPLETED 贯穿多态）。`seasonId`→`tournamentId` 的纯字段改名可用受控 sed，但状态比较逐处人工核。
- 每个 Task 独立 commit。

---

## 文件结构总览

| 文件 | 责任 | 动作 |
|---|---|---|
| `prisma/schema.prisma` | 数据模型 | 合并 Season→Tournament、改 FK、并枚举 |
| `prisma/migrations/` | 迁移基线 | 清空重建为单一 init |
| `src/lib/tournament/tournament-service.ts` | 赛事生命周期（吸收 season-service） | 扩展 |
| `src/lib/tournament/tournament-schema.ts` | 创建/更新 Zod 入参（吸收 season-schema） | 新建 |
| `src/lib/season/**` | 旧赛季服务 | **删除** |
| `src/lib/tournament/guards.ts` | 归档只读守卫 | 改读 tournament |
| `src/lib/draft/engine.ts` | 选秀引擎 | DRAFTING→GROUPING + 改名 |
| `src/lib/registration/registration-service.ts` | 报名 | 改名 + 状态门禁 |
| `src/lib/captains/captain-service.ts` · `src/lib/teams/team-service.ts` | 队长/队伍 | 改名 |
| `src/lib/tournament/{groups,schedule,reservation,score,tournament}-service.ts` | 赛制 | 门禁白名单化 |
| `src/lib/tournament/test-fixtures.ts` | 测试夹具 | status/字段改名 |
| `src/app/api/seasons/**` → `src/app/api/tournament/**` | HTTP 路由 | 移动/合并 |
| `src/app/api/live/[seasonId]/**` | SSE 路由 | 改 `[tournamentId]` |
| `src/app/admin/season/**` → `src/app/admin/tournament/**` | 管理端页面 | 合并 |
| `src/app/**`, `src/components/**` | 全站页面/组件 | getActiveSeason 改名 + 文案 |

---

## Task 1: Schema 合并 + 迁移基线重建

**Files:**
- Modify: `prisma/schema.prisma`
- Delete+recreate: `prisma/migrations/`
- Reference: spec §2

- [ ] **Step 1: 改写 `enum`（删 SeasonStatus，扩 TournamentStatus）**

`prisma/schema.prisma` 删除整个 `enum SeasonStatus { ... }`（行 28-35）。把 `enum TournamentStatus`（行 295-300）改为：

```prisma
enum TournamentStatus {
  SETUP
  REGISTRATION
  ROSTER_LOCKED
  DRAFTING
  GROUPING
  GROUP_STAGE
  KNOCKOUT
  FINISHED
  ARCHIVED
}
```

- [ ] **Step 2: 合并 Season 字段进 Tournament，删 Season 模型**

删除整个 `model Season { ... }`（行 72-87）。把 `model Tournament`（行 302-318）改为：

```prisma
model Tournament {
  id         String           @id @default(cuid())
  name       String
  kind       String           @default("正赛")
  status     TournamentStatus @default(SETUP)
  config     Json
  teamBudget Float            @default(1000)
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt
  archivedAt DateTime?

  registrations Registration[]
  teams         Team[]
  draftSession  DraftSession?
  stages        TournamentStage[]
  tournamentTeams TournamentTeam[]
  matches       Match[]

  @@map("tournaments")
}
```

- [ ] **Step 3: 改 Registration/Team/DraftSession 外键 seasonId→tournamentId**

- `model Registration`：`seasonId` → `tournamentId`；`season Season @relation(...)` → `tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)`；`@@unique([seasonId, playerId])` → `@@unique([tournamentId, playerId])`；`@@index([seasonId])` → `@@index([tournamentId])`。
- `model Team`：`seasonId` → `tournamentId`；relation 同上；`@@index([seasonId])` → `@@index([tournamentId])`。
- `model DraftSession`：`seasonId String @unique` → `tournamentId String @unique`；relation 同上。
- `model Tournament`：旧快照关系 `teams TournamentTeam[]` **改名为** `tournamentTeams TournamentTeam[]`（让位给新增的直属 `teams Team[]`，原 Season 直属队伍）。此改名导致 `schedule-service.ts:21,30` 的 `t.teams`（快照）类型错——在 Task6 迁移（P1-3）。`TournamentGroup.teams`（组成员）不改。

- [ ] **Step 4: 校验 schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: 修测试基建 truncate 列表（P0-1，必须与 schema 同 Task）**

`src/lib/test/db.ts:17`：`resetDb` 的 `TRUNCATE` 列表里**删掉 `"seasons"`**（该表已不存在，否则所有 `beforeEach(resetDb)` 用例在执行前即 relation-not-found）。`"tournaments"` 等保留。改后该行末尾为：`"team_slots", "teams", "registrations", "players", "users"`（去掉 `, "seasons"`）。

- [ ] **Step 6: 非交互式重建迁移基线（P1-4，禁用 migrate dev 交互）**

```bash
rm -rf prisma/migrations && mkdir -p prisma/migrations/00000000000000_init
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql
# dev/test 库各自 drop+recreate 后套用新基线（非交互）：
npx prisma migrate reset --force --skip-seed   # dev 库：drop→重建→应用 init
npx prisma generate
```
Expected: 生成单一 `init/migration.sql`；dev 库重建为新 schema；client 生成成功（`@prisma/client` 不再导出 `Season`/`SeasonStatus`）。`TEST_DATABASE_URL` 指向的测试库同样需重建（`DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate reset --force --skip-seed`）。
> `migrate reset --force` 非交互；不要用 `migrate dev`（会提示 drift 等人工确认）。

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/test/db.ts
git commit -m "feat(schema): merge Season into Tournament, reset migration baseline, fix test truncate"
```

> 注：此后 `npx tsc --noEmit` 全局报错（season-service / 各 seasonId 引用），属预期，后续 Task 逐步消除。

---

## Task 2: 归档只读守卫改读 tournament（P0-2：必须在 tournament-service 之前）

> 顺序原因（codex P0-2）：旧 `tournament-service.ts` import `assertSeasonWritableBySeasonId`、`guards.ts` 读 `db.season`。Task1 生成新 client 后 `db.season` 不存在。先把 guard 切到 tournament，Task3 的 tournament-service 测试才不会卡在 guard 而非目标实现。guards.ts 不 import tournament-service，故本 Task 可独立编译/跑测试。

**Files:**
- Modify: `src/lib/tournament/guards.ts`, `src/lib/tournament/guards.test.ts`
- Reference: spec §3.3, §4.3

- [ ] **Step 1: 写失败测试**

`guards.test.ts`：归档赛事下 `assertTournamentWritable` 抛错；活跃赛事通过。

```typescript
import { assertTournamentWritable } from './guards';
it('rejects writes on ARCHIVED tournament', async () => {
  const t = await testDb.tournament.create({ data: { name: 'X', kind: '正赛', config: {}, status: 'ARCHIVED', archivedAt: new Date() } });
  await expect(assertTournamentWritable(testDb, t.id)).rejects.toThrow();
});
it('passes on active tournament', async () => {
  const t = await testDb.tournament.create({ data: { name: 'Y', kind: '正赛', config: {}, status: 'GROUP_STAGE' } });
  await expect(assertTournamentWritable(testDb, t.id)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/lib/tournament/guards.test.ts`
Expected: FAIL

- [ ] **Step 3: 改写 guards.ts（删 season 关系，直接读 tournament）**

```typescript
export async function assertTournamentWritable(db: Db, tournamentId: string): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, archivedAt: true } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status === 'ARCHIVED' || t.archivedAt !== null)
    throw new TournamentError('INVALID_STATE', '赛事已归档，不可修改');
}
```
> 旧 `assertSeasonWritable` / `assertSeasonWritableBySeasonId` 两变体合一为 `assertTournamentWritable(db, tournamentId)`。本 Task 仅改 guards.ts + 测试；其它文件对旧名的 import 在各自 Task 切换（Task3 切 tournament-service、Task6 切赛制服务）。

- [ ] **Step 4: 运行转绿**

Run: `npx vitest run src/lib/tournament/guards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/guards.ts src/lib/tournament/guards.test.ts
git commit -m "feat(tournament): assertTournamentWritable reads tournament directly"
```

---

## Task 3: tournament-service 吸收 season-service（创建 + 状态机）

**Files:**
- Create: `src/lib/tournament/tournament-schema.ts`
- Modify: `src/lib/tournament/tournament-service.ts`
- Modify: `src/lib/tournament/tournament-service.test.ts`
- Delete: `src/lib/season/season-service.ts`, `src/lib/season/season-schema.ts`, `src/lib/season/season-service.test.ts`, `src/lib/season/season-schema.test.ts`, `src/lib/season/season-tournament.test.ts`, `src/lib/season/errors.ts`
- Reference: spec §3.1, §4.1, §4.2

- [ ] **Step 1: 新建 `tournament-schema.ts`（扁平化入参，吸收 CreateSeasonInput）**

```typescript
import { z } from 'zod';

export const CreateTournamentInput = z.object({
  name: z.string().trim().min(1, '赛事名称必填').max(60, '赛事名称过长'),
  teamBudget: z.number().positive('预算必须大于 0'),
  kind: z.string().trim().min(1).max(20),
  config: z.object({}).passthrough(),
});
export type CreateTournamentInput = z.infer<typeof CreateTournamentInput>;

export const UpdateBudgetInput = z.object({
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetInput>;
```

- [ ] **Step 2: 写失败测试 — transitionTournament 9 态边矩阵**

在 `tournament-service.test.ts` 增：

```typescript
import { createTournament, transitionTournament, getActiveTournament, archiveActiveTournament } from './tournament-service';
import { testDb } from '@/lib/test/db';

// 合法 GroupKnockoutConfig（types.ts:6-14：template + advancingPerGroup + knockoutBestOf 为 Record）
const CFG = { template: 'group-knockout', groupCount: 2, teamsPerGroup: 2, advancingPerGroup: 1, groupBestOf: 1, knockoutBestOf: { FINAL: 1 } };
const mk = (name = 'T1') =>
  createTournament(testDb, { name, teamBudget: 1000, kind: '正赛', config: CFG }, 'u');

describe('transitionTournament', () => {
  it('walks the full linear lifecycle', async () => {
    const t = await mk();
    expect(t.status).toBe('SETUP');
    for (const next of ['REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING'] as const) {
      const u = await transitionTournament(testDb, t.id, next);
      expect(u.status).toBe(next);
    }
  });
  it('rejects illegal edge SETUP -> GROUP_STAGE', async () => {
    const t = await mk();
    await expect(transitionTournament(testDb, t.id, 'GROUP_STAGE')).rejects.toThrow();
  });
  it('allows ROSTER_LOCKED -> REGISTRATION rollback', async () => {
    const t = await mk();
    await transitionTournament(testDb, t.id, 'REGISTRATION');
    await transitionTournament(testDb, t.id, 'ROSTER_LOCKED');
    const u = await transitionTournament(testDb, t.id, 'REGISTRATION');
    expect(u.status).toBe('REGISTRATION');
  });
});

describe('archiveActiveTournament', () => {
  it('keeps at most one non-archived tournament', async () => {
    const a = await mk('A');
    const b = await mk('B'); // creating B archives A
    expect((await testDb.tournament.findUnique({ where: { id: a.id } }))!.status).toBe('ARCHIVED');
    const active = await getActiveTournament(testDb);
    expect(active!.id).toBe(b.id);
  });
});
```

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run src/lib/tournament/tournament-service.test.ts -t transitionTournament`
Expected: FAIL（`transitionTournament` / `createTournament` 未定义）

- [ ] **Step 4: 在 tournament-service.ts 实现吸收的函数**

新增（沿用旧 season-service 逻辑，状态/表改名）：

```typescript
import { CreateTournamentInput } from './tournament-schema';

export async function getActiveTournament(db: Db) {
  return db.tournament.findFirst({ where: { status: { not: 'ARCHIVED' } } });
}
export async function listTournaments(db: Db) {
  return db.tournament.findMany({ orderBy: { createdAt: 'desc' } });
}
export async function archiveActiveTournament(db: Db): Promise<void> {
  const active = await getActiveTournament(db);
  if (!active) return;
  await db.tournament.update({ where: { id: active.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
}

export const BUDGET_EDITABLE_STATUSES: TournamentStatus[] = ['SETUP', 'REGISTRATION', 'ROSTER_LOCKED'];

export async function updateTournamentBudget(db: Db, tournamentId: string, teamBudget: number) {
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (!BUDGET_EDITABLE_STATUSES.includes(t.status))
    throw new TournamentError('INVALID_STATE', '选秀已开始，队伍预算已锁定，无法修改');
  return db.tournament.update({ where: { id: tournamentId }, data: { teamBudget } });
}

const ALLOWED: Record<TournamentStatus, TournamentStatus[]> = {
  SETUP: ['REGISTRATION'],
  REGISTRATION: ['ROSTER_LOCKED'],
  ROSTER_LOCKED: ['REGISTRATION', 'DRAFTING'],
  DRAFTING: ['GROUPING'],
  GROUPING: ['GROUP_STAGE'],
  GROUP_STAGE: ['KNOCKOUT'],
  KNOCKOUT: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export async function transitionTournament(db: Db, tournamentId: string, next: TournamentStatus) {
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (!ALLOWED[t.status].includes(next))
    throw new TournamentError('INVALID_TRANSITION', `不允许的赛事状态变更: ${t.status} → ${next}`);
  return db.tournament.update({ where: { id: tournamentId }, data: { status: next } });
}

export async function createTournament(db: PrismaClient, input: CreateTournamentInput, actorUserId: string) {
  const config = groupKnockout.validate(input.config); // 非法 config 在此抛 INVALID_CONFIG，整体不建
  return db.$transaction(async (tx) => {
    await archiveActiveTournament(tx);
    const t = await tx.tournament.create({
      data: { name: input.name, teamBudget: input.teamBudget, kind: input.kind, config, status: 'SETUP' },
    });
    await createSkeletonRecords(tx, t.id, config); // 复用现有函数（建 stages/groups 占位/空位对阵/晋级边，不建快照）
    await writeAudit(tx, {
      userId: actorUserId, action: 'tournament.create', entity: 'Tournament', entityId: t.id,
      payload: { name: input.name, config: config as object },
    });
    return t;
  });
}
```

> **P1-2 保留旧 shell 三件事**：`groupKnockout.validate` → `createSkeletonRecords` → `writeAudit('tournament.create')`，缺一不可（对照旧 `createTournamentShell` tournament-service.ts:55-71）。**不**在创建路径调 `assertTournamentWritable`（新建赛事必非归档，guard 是 update/reset 调用方的事，且会与 Task2 顺序冲突）。旧 shell 的 `seasonId` 唯一性检查（`TOURNAMENT_EXISTS`）**删除**——单一实体下不存在"一季两赛事"，`archiveActiveTournament` 已保证单活跃。`ARCHIVED` 不经 `transitionTournament`（由 archive 函数写），故不在 ALLOWED 内列 `(任意)→ARCHIVED`。旧 `createTournamentShell` / `assertSeasonWritableBySeasonId` 整体删除，`updateTournamentConfig` 内的 `assertSeasonWritableBySeasonId(db, t.seasonId)` 改 `assertTournamentWritable(db, t.id)`。

- [ ] **Step 5: 删除 season 目录的所有文件**

```bash
git rm src/lib/season/season-service.ts src/lib/season/season-schema.ts \
  src/lib/season/season-service.test.ts src/lib/season/season-schema.test.ts \
  src/lib/season/season-tournament.test.ts src/lib/season/errors.ts
```
> `SeasonError` 的用法迁到 `TournamentError`（`src/lib/tournament/errors.ts`），补缺失的 error code（`INVALID_TRANSITION`/`INVALID_STATE`/`TOURNAMENT_NOT_FOUND` 若无则加）。

- [ ] **Step 6: 运行测试转绿**

Run: `npx vitest run src/lib/tournament/tournament-service.test.ts`
Expected: PASS（transition/archive/create 全过；旧 shell 断言去掉 season 父级）

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament src/lib/season
git commit -m "feat(tournament): absorb season-service (createTournament, transitionTournament, 9-state machine)"
```

---

## Task 4: 选秀引擎 DRAFTING→GROUPING + 字段改名

**Files:**
- Modify: `src/lib/draft/engine.ts`, `src/lib/draft/engine.test.ts`
- Reference: spec §3.2, §4.4

- [ ] **Step 1: 改测试断言（选秀完成 = GROUPING）**

`engine.test.ts`：把 import 改 `createTournament, transitionTournament from '@/lib/tournament/tournament-service'`；造数据 `createTournament(testDb, { name, teamBudget, kind:'正赛', config: T.config }, 'u')`（入参扁平化，去掉嵌套 `tournament:`）；所有 `transitionSeason`→`transitionTournament`；选秀完成断言改：

```typescript
// 选秀引擎跑完后
const t = await testDb.tournament.findUnique({ where: { id: tournamentId } });
expect(t!.status).toBe('GROUPING'); // 旧为 COMPLETED
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/lib/draft/engine.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 engine.ts**

- `tx.season.update({ ... data: { status: 'COMPLETED' } })`（line ~454、~559）→ `tx.tournament.update({ where: { id: session.tournamentId }, data: { status: 'GROUPING' } })`。
- `data: { status: 'DRAFTING' }`（line ~133、~782、~855）/ `'ROSTER_LOCKED'`（line ~167）的 `tx.season.update` → `tx.tournament.update`。
- 全文件 `session.seasonId`→`session.tournamentId`、`season.status`→`tournament.status`、`db.season.*`→`db.tournament.*`、`getActiveSeason`→`getActiveTournament`。
- 选秀启动前置 `season.status !== 'ROSTER_LOCKED'`（line ~68）保持语义，读 `tournament.status`。

- [ ] **Step 4: 运行转绿**

Run: `npx vitest run src/lib/draft/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/draft
git commit -m "feat(draft): drive DRAFTING->GROUPING on draft completion, rename seasonId"
```

---

## Task 5: 报名/队长/队伍服务改名 + 门禁

**Files:**
- Modify: `src/lib/registration/registration-service.ts` (+test), `src/lib/captains/captain-service.ts` (+test), `src/lib/teams/team-service.ts` (+test)
- Reference: spec §3.2

- [ ] **Step 1: 改三个 test 文件的 import 与造数**

把 `createSeason/transitionSeason from '@/lib/season/season-service'` → `createTournament/transitionTournament from '@/lib/tournament/tournament-service'`；`createTournament(testDb, { name, teamBudget, kind:'正赛', config: CFG }, 'u')`（扁平）；`transitionSeason`→`transitionTournament`；造的实体变量名 `season`→`tournament`、`s.id` 作为 `tournamentId` 传入。

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/lib/registration src/lib/captains src/lib/teams`
Expected: FAIL（类型/字段不匹配）

- [ ] **Step 3: 改三个 service**

- `registration-service.ts`：`ROSTER_EDITABLE_STATUSES: TournamentStatus[] = ['SETUP','REGISTRATION','ROSTER_LOCKED']`（类型改名，值不变）；`season`→`tournament`、`seasonId`→`tournamentId`；公开提交闸 `status !== 'REGISTRATION'` 读 tournament。
- `captain-service.ts` / `team-service.ts`：`seasonId`→`tournamentId`、`db.season.*`→`db.tournament.*`、`season.status`→`tournament.status`（语义不变）。

- [ ] **Step 4: 运行转绿**

Run: `npx vitest run src/lib/registration src/lib/captains src/lib/teams`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration src/lib/captains src/lib/teams
git commit -m "feat(roster): rename seasonId->tournamentId in registration/captains/teams services"
```

---

## Task 6: 赛制服务门禁白名单化 + 夹具改名

**Files:**
- Modify: `src/lib/tournament/groups-service.ts`, `schedule-service.ts`, `reservation-service.ts`, `score-service.ts`, `tournament-service.ts`(config 闸), `test-fixtures.ts` (+各对应 test)
- Reference: spec §3.1, §3.2, §3.3

- [ ] **Step 1: 改 test-fixtures.ts**

```typescript
// seedTeamsForSeason -> seedTeamsForTournament(tournamentId, n)；registration/team.create 的 seasonId -> tournamentId
export async function seedTournamentWithTeams(n: number) {
  const tournament = await testDb.tournament.create({
    data: { name: 'T-test', kind: '正赛', config: {}, status: 'GROUPING', teamBudget: 1000 }, // 旧 COMPLETED -> GROUPING
  });
  const teamIds = await seedTeamsForTournament(tournament.id, n);
  return { tournamentId: tournament.id, teamIds };
}
```
> 全仓引用 `seedSeasonWithTeams`/`seedTeamsForSeason`/`{ seasonId }` 解构 → 新名 + `{ tournamentId }`。

- [ ] **Step 2: 写失败测试 — 门禁白名单**

`reservation-service.test.ts` 增：

```typescript
it('rejects reservation listing during pre-bracket states', async () => {
  const { tournamentId } = await seedTournamentWithTeams(2);
  for (const st of ['REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING'] as const) {
    await testDb.tournament.update({ where: { id: tournamentId }, data: { status: st } });
    expect(await listReservableMatches(testDb, { tournamentId, actor: { role: 'ADMIN' } })).toEqual([]);
  }
});
it('allows during GROUP_STAGE / KNOCKOUT', async () => {
  const { tournamentId } = await seedTournamentWithTeams(2);
  await testDb.tournament.update({ where: { id: tournamentId }, data: { status: 'GROUP_STAGE' } });
  // listReservableMatches 不再因状态返空（具体匹配数依夹具，断言不抛 + 状态闸通过）
  await expect(listReservableMatches(testDb, { tournamentId, actor: { role: 'ADMIN' } })).resolves.toBeDefined();
});
```

`schedule-service.test.ts` 增：addCustomMatch 在 `DRAFTING`/`GROUPING` 抛错；`GROUP_STAGE` 通过。

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run src/lib/tournament/reservation-service.test.ts src/lib/tournament/schedule-service.test.ts`
Expected: FAIL

- [ ] **Step 4: 改门禁为白名单**

- `reservation-service.ts`：`canListReservableMatches` 删 `season` 关系读取，改：
```typescript
const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, archivedAt: true } });
if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
if (t.status === 'ARCHIVED' || t.archivedAt !== null) return false;
return t.status === 'GROUP_STAGE' || t.status === 'KNOCKOUT'; // 白名单，替换 !== SETUP && !== FINISHED
```
  `reserveMatch` 里 `status === 'SETUP' || status === 'FINISHED'` 抛错 → 改 `!(status === 'GROUP_STAGE' || status === 'KNOCKOUT')` 抛错。
- `schedule-service.ts`：① `addCustomMatch` 的 `=== 'FINISHED'` / `=== 'SETUP'` 两道反向排除 → `if (!(t.status === 'GROUP_STAGE' || t.status === 'KNOCKOUT')) throw new TournamentError('INVALID_STATE', '当前赛事状态不允许添加自定义比赛')`。② **快照关系改名（P1-3）**：schema 里 `Tournament` 的快照关系由旧 `teams`（`TournamentTeam[]`）改名为 `tournamentTeams`，而新增的 `teams`（`Team[]`，原 Season 直属队伍）会顶替这个名字。故 `schedule-service.ts:21` 的 `include: { teams: true, ... }` → `include: { tournamentTeams: true, ... }`、`:30` 的 `t.teams.map((x) => x.teamId)` → `t.tournamentTeams.map((x) => x.teamId)`。**注意**：`group.teams`（`TournamentGroup.teams = TournamentGroupTeam[]`，如 :38、bracket-service:41、read-model、groups-service:119）**不改**，那是小组成员关系。实现前先 `grep -rn "\.teams\b\|teams: true" src/lib/tournament src/app` 把"赛事级快照 teams"与"组级成员 teams"逐处分类，仅前者改名。
- `groups-service.ts`：assignGroups（line 17）/ confirmGroups（line 107）的 `t.status !== 'SETUP'` → `!== 'GROUPING'`；confirmGroups 成功后把状态推进到 `GROUP_STAGE`（保持原写法：直接 `update` 到 `'GROUP_STAGE'`，或经 `transitionTournament(tx, id, 'GROUP_STAGE')`）。
- `tournament-service.ts`（updateTournamentConfig，line 99）：config 闸 `t.status !== 'SETUP'` → `if (wantsConfig && ['GROUP_STAGE','KNOCKOUT','FINISHED','ARCHIVED'].includes(t.status)) throw ...`（即仅 `< GROUP_STAGE` 可改）；name/kind 闸 `=== 'FINISHED'`（line 97）保持。
- `score-service.ts`：`syncFinalStatus`（line 91-101）已操作 tournament、FINISHED↔KNOCKOUT 物化，**无需改逻辑**，仅确认 `seasonId` 无残留。

- [ ] **Step 5: 运行转绿（赛制全测试）**

Run: `npx vitest run src/lib/tournament`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament
git commit -m "feat(tournament): allow-list status gates, GROUPING grouping window, rename fixtures"
```

---

## Task 7: HTTP 路由移动/合并

**Files:**
- Move: `src/app/api/seasons/**` → `src/app/api/tournament/**`（合并到现有 tournament 命名空间）
- Move: `src/app/api/live/[seasonId]/**` → `src/app/api/live/[tournamentId]/**`
- Delete: `POST` handler in `src/app/api/tournament/admin/route.ts`（创建 shell 入口）
- Modify: draft/captain/registration/teams 路由内 `seasonId` 引用
- Reference: spec §5

- [ ] **Step 1: 移动 seasons 集合路由**

```bash
git mv src/app/api/seasons/route.ts src/app/api/tournament/route.ts
git mv src/app/api/seasons/[id]/route.ts src/app/api/tournament/[id]/route.ts
git mv src/app/api/seasons/[id]/transition/route.ts src/app/api/tournament/[id]/transition/route.ts
rmdir "src/app/api/seasons/[id]" src/app/api/seasons 2>/dev/null || true
```
- `tournament/route.ts`：`POST` 用 `CreateTournamentInput`（扁平）+ `createTournament`；`GET` 用 `listTournaments`。
- `tournament/[id]/transition/route.ts`：用 `transitionTournament`，body 的 `next` 类型 `TournamentStatus`。
- 所有 handler 内 `getActiveSeason`→`getActiveTournament`、`createSeason`→`createTournament`、`SeasonError`→`TournamentError`、`CreateSeasonInput`→`CreateTournamentInput`。

> 注意：现有 `src/app/api/tournament/[id]/` 若已存在会与 mv 目标冲突——先确认无同名文件再 mv；有冲突则手动合并 handler。

- [ ] **Step 2: 移动 live SSE 路由**

```bash
git mv "src/app/api/live/[seasonId]" "src/app/api/live/[tournamentId]"
```
内部 `params.seasonId`→`params.tournamentId`、查询字段改名。前端 EventSource URL（组件里 `/api/live/${seasonId}/...`）在 Task 8 一并改。

- [ ] **Step 3: 移除 admin 创建 shell 入口**

`src/app/api/tournament/admin/route.ts`：删除 `POST`（旧 createTournamentShell 老赛季 fallback，合并后不存在"无赛事"态）。`PATCH`（updateTournamentConfig）、`reset`、`state` 等保留，内部 `seasonId`→`tournamentId`。

- [ ] **Step 4: 扫 draft/captain/registration/teams 路由的 seasonId**

逐文件把 `getActiveSeason`→`getActiveTournament`、`season.id`→`tournament.id`、`season.status` 按 spec §3.3 语义判断（如 captain/team/route.ts 的 COMPLETED → 白名单，见 Task 8 同源逻辑；route 与 page 用同一判断）。`/api/live/[seasonId]` 的调用方 URL 改 `[tournamentId]`。

- [ ] **Step 5: 类型检查该层**

Run: `npx tsc --noEmit 2>&1 | grep "src/app/api" | head`
Expected: api 层无 season 相关报错（残留报错应仅来自尚未处理的 UI 页面）

- [ ] **Step 6: Commit**

```bash
git add src/app/api
git commit -m "feat(api): move /api/seasons into /api/tournament, rename live route param, drop shell POST"
```

---

## Task 8: UI 页面/组件改名 + 文案

**Files:**
- Move/merge: `src/app/admin/season/**` → `src/app/admin/tournament/**`（与现有合并）
- Rename: `SeasonManager` → `TournamentManager`（组件文件）
- Modify: 全量 `getActiveSeason` 页面调用点、captain/team page、EventSource URL、文案 "赛季"→"赛事"
- Reference: spec §3.3, §6

- [ ] **Step 1: getActiveSeason 调用点改名（30+ 页面）**

逐文件 `import { getActiveSeason } from '@/lib/season/season-service'` → `import { getActiveTournament } from '@/lib/tournament/tournament-service'`；变量 `season`→`tournament`。涉及（非穷举，用 grep 定位）：`app/page.tsx`、`app/captain/{page,layout,team/page}.tsx`、`app/tournament/layout.tsx`、`app/admin/{page,draft,config,audit,teams,tournament,registrations}/page.tsx`、`app/register/page.tsx`。

- [ ] **Step 2: captain/team page 的 COMPLETED 展开（spec §3.3）**

`app/captain/team/page.tsx:24` 与 `api/captain/team/route.ts`：
```typescript
const OPEN = ['GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'];
if (!tournament || !OPEN.includes(tournament.status)) redirect('/captain');
// 过期队长账号判断 team.seasonId -> team.tournamentId
```

- [ ] **Step 3: admin/season 页面合并进 admin/tournament**

```bash
git mv src/app/admin/season/page.tsx src/app/admin/tournament/season-admin.tsx  # 或合并入现有 tournament 页
```
把「赛季管理」（创建/预算/状态推进）与现有赛事 Setup 视图合并为单一赛事管理视图。`SeasonManager` 组件 → 重命名 `TournamentManager`，创建表单去掉嵌套"赛事设置"分区、扁平为 name/teamBudget/kind/config（`TournamentConfigForm` 复用不变）。
> grep `SeasonManager` 全部引用同步改名。导航菜单「赛季」入口文案与 href 同改。

- [ ] **Step 4: GROUPING config-clear 二次确认保留（spec §3.2 约束1）**

确认 `SetupTab.tsx`（约 line 73-75）的「已保存的分组将清空」确认在改 config 路径仍触发（状态判断由 SETUP 扩到 `< GROUP_STAGE`）。

- [ ] **Step 5: EventSource URL + 文案**

组件里 `/api/live/${seasonId}/state|stream` → `/api/live/${tournamentId}/...`。全站可见文案 "赛季" → "赛事"（grep 中文文案逐处；保留历史 spec 文档不动）。

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit 2>&1 | grep -i season | head`
Expected: 无输出（无 season 残留）

- [ ] **Step 7: Commit**

```bash
git add src/app src/components
git commit -m "feat(ui): rename season->tournament across pages/components, expand captain gate"
```

---

## Task 9: 全量绿 + 集成测试 + 构建

**Files:**
- Modify: `src/lib/tournament/integration.test.ts`, `integration-m2.test.ts`, `src/lib/admin/overview-stats.test.ts`, `player-stats-service.test.ts` 及任何残留引用
- Reference: spec §8

- [ ] **Step 1: 清残留引用**

Run: `grep -rn "season\|Season" src --include=*.ts --include=*.tsx | grep -vi "tournament" | grep -v "// " | head -50`
逐处消除（import、类型、字段、变量、文案）。集成测试入口 `createSeason`→`createTournament`（扁平入参）。

- [ ] **Step 2: 改写集成测试为单实体全链路**

`integration.test.ts`：建赛事(带 config) → REGISTRATION → 报名 → ROSTER_LOCKED → DRAFTING → 选秀完成(断言 GROUPING) → assignGroups → confirmGroups(GROUP_STAGE) → 录分 → KNOCKOUT → 决赛(FINISHED) → 归档。全程读单一 `tournament.status`。

- [ ] **Step 3: 全量测试**

Run: `npx vitest run`
Expected: 全绿（旧 season-* 测试已删，新增 transition/gate/lifecycle 全过）

- [ ] **Step 4: 类型 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 类型错误；build 成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(tournament): single-entity lifecycle integration, full green build"
```

---

## Task 10: dev 迁移落地 + smoke（生产部署单列）

**Files:** 运维操作；参考 spec §7

- [ ] **Step 1: dev 库已在 Task 1 重建** — 确认 `npx prisma migrate status` 为最新基线。

- [ ] **Step 2: seed admin + smoke（dev）**

Run: `npx prisma db seed`（或现有 admin 初始化脚本）
然后手动 smoke：admin 登录 → 创建赛事(kind/config) → /api/tournament 列表返回 → 报名接口 → 骨架数量符合 config。

- [ ] **Step 3: 生产部署** — **不在本 plan 自动执行**。按 spec §7 的 10 步硬步骤进维护窗口操作（stop pm2 → dump 记录路径 → drop/recreate DB → 部署 → migrate deploy → seed → build → smoke → start），需与 codex 协调生产服务器、确认 `backup-pre-unify-20260614` 回滚分支已建。交由用户确认时机后单独执行。

---

## Self-Review 记录

- **spec 覆盖**：§2 模型→T1；§2.2 枚举→T1；§3.1 状态边→T3；§3.2 门禁→T4/T5/T6；§3.3 callsite 映射→T4/T6/T7/T8；§4.1 createTournament→T3；§4.2 退役→T3；§4.3 守卫→T2（提前于 tournament-service，P0-2）；§4.4 引擎→T4；§5 路由→T7；§6 UI→T8；§7 迁移→T1/T10；§8 测试→各 Task + T9。无遗漏。
- **codex plan 复审 rev.2 闭合**：P0-1 test/db.ts truncate 去 seasons（T1 Step5）；P0-2 guards 提前到 T2；P1-1 合法 CFG；P1-2 createTournament 保留 validate+skeleton+audit、删 guard/exists-check；P1-3 快照关系 teams→tournamentTeams 调用点迁移（T6）；P1-4 非交互 migrate（T1 Step6）。
- **类型一致性**：`createTournament`/`transitionTournament`/`getActiveTournament`/`archiveActiveTournament`/`updateTournamentBudget`/`assertTournamentWritable`/`CreateTournamentInput`/`seedTournamentWithTeams` 跨 Task 命名统一。
- **无占位符**：关键逻辑（ALLOWED 边、白名单闸、GROUPING 断言、createTournament）均给实代码；机械改名给精确规则 + 验证命令。
