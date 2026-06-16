# 对局数据导入（脚本直推 + JSON 上传）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 lol-capture 抓到的 `summary.json`（脚本直推或后台上传）先进暂存区，由管理员选定赛事对阵、映射选手、微调后确认，原子写入现有 Game/GamePlayerStat 并存全字段，计入排行榜。

**Architecture:** 两入口 → `POST /api/tournament/imports`（token 或 admin）→ `MatchImport` 暂存（PENDING）→ admin 审核页（选 Match/第几局、按 name#tag 分阵营自动映射、未命中手动选、可微调）→ `commit` 在**单事务**内复用抽出的 `saveGameDetailTx` 写 Game + 10 条 GamePlayerStat + extStats，并标记 COMMITTED。

**Tech Stack:** Next.js App Router、Prisma(Postgres)、NextAuth、zod、vitest；Go(lol-capture)。

**Spec:** `docs/superpowers/specs/2026-06-17-match-import-design.md`（含 5 个 P1 的硬约束）。

---

## File Structure

- `prisma/schema.prisma` — 加 `MatchImport` 模型 + 两个 enum + `GamePlayerStat.extStats Json?`
- `prisma/migrations/<ts>_match_import/migration.sql` — 建表/加列 + COMMITTED partial unique index（raw SQL）
- `scripts/build-champions.mjs` — 生成时多带 `riotId`
- `src/data/champions.json` — 重新生成（每英雄加 `riotId`）
- `src/lib/tournament/champions.ts` — 加 `championKeyByNumericId()`
- `src/lib/tournament/game-detail-service.ts` — 抽出 `saveGameDetailTx(tx, input)`，`saveGameDetail` 包一层
- `src/lib/tournament/import-service.ts` — 新建：ingest（建暂存）、roster+auto-map、commit（单事务）
- `src/lib/tournament/import-schema.ts` — 新建：summary 最小 zod、commit body zod
- `src/app/api/tournament/imports/route.ts` — 新建：POST 入口（token 或 admin）
- `src/app/api/tournament/admin/imports/route.ts` — GET 列表
- `src/app/api/tournament/admin/imports/[id]/route.ts` — GET 详情
- `src/app/api/tournament/admin/imports/[id]/mapping/route.ts` — GET 给定 matchId 的分阵营花名册+自动映射建议
- `src/app/api/tournament/admin/imports/[id]/commit/route.ts` — POST 确认入库
- `src/app/api/tournament/admin/imports/[id]/discard/route.ts` — POST 丢弃
- `src/middleware.ts` — 仅精确放行 `POST /api/tournament/imports`
- `src/app/admin/imports/page.tsx` + `src/components/admin/imports/*` — 审核 UI
- `tools/lol-capture/main.go` + `upload.go` — `--server/--token` 上传
- 各 `*.test.ts` 测试

> 迁移注意：dev 库按现有 prisma migrate 流程；遵循 tournament 迁移 baseline 经验（见 [[tournament-v2-m1-state]]）。

---

## Task 1: 英雄数字 id → key 映射（P1-1）

**Files:**
- Modify: `scripts/build-champions.mjs`
- Modify (generated): `src/data/champions.json`
- Modify: `src/lib/tournament/champions.ts`
- Test: `src/lib/tournament/champions.test.ts`

- [ ] **Step 1: 改生成脚本带 riotId**

`scripts/build-champions.mjs` 里 map 改成（Data Dragon `c.key` 即数字 id 字符串）：
```js
const champions = Object.values(data.data)
  .map((c) => ({ key: c.id, riotId: Number(c.key), name: c.name, title: c.title }))
  .sort((a, b) => a.key.localeCompare(b.key));
```

- [ ] **Step 2: 重新生成 champions.json**

Run: `node scripts/build-champions.mjs`
Expected: `src/data/champions.json` 每个英雄含 `riotId`（如 `{ "key":"Aatrox","riotId":266,... }`）。

- [ ] **Step 3: 写失败测试**

`src/lib/tournament/champions.test.ts`：
```ts
import { expect, it } from 'vitest';
import { championKeyByNumericId } from './champions';

it('数字 championId 能映射到 Data Dragon key', () => {
  expect(championKeyByNumericId(266)).toBe('Aatrox'); // 暗裔剑魔
  expect(championKeyByNumericId(202)).toBe('Jhin');    // 烬
});
it('未知数字 id 返回 null', () => {
  expect(championKeyByNumericId(99999)).toBeNull();
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npm run test -- champions`
Expected: FAIL（`championKeyByNumericId` 未定义）。

- [ ] **Step 5: 实现**

`src/lib/tournament/champions.ts` 增：
```ts
export type Champion = { key: string; riotId: number; name: string; title: string };
const BY_NUMERIC = new Map<number, string>(CHAMPIONS.map((c) => [c.riotId, c.key]));

/** Riot 数字 championId → Data Dragon key；未知返回 null。 */
export function championKeyByNumericId(id: number): string | null {
  return BY_NUMERIC.get(id) ?? null;
}
```

- [ ] **Step 6: 跑测试确认通过 + commit**

Run: `npm run test -- champions`（PASS）
```bash
git add scripts/build-champions.mjs src/data/champions.json src/lib/tournament/champions.ts src/lib/tournament/champions.test.ts
git commit -m "feat(champions): add numeric riot id -> key mapping"
```

---

## Task 2: 数据模型 + 迁移（MatchImport / extStats / partial unique）（P1-5）

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_match_import/migration.sql`

- [ ] **Step 1: schema 加模型 + 列**

`prisma/schema.prisma` 追加：
```prisma
enum MatchImportSource { SCRIPT UPLOAD }
enum MatchImportStatus { PENDING COMMITTED DISCARDED }

model MatchImport {
  id              String            @id @default(cuid())
  createdAt       DateTime          @default(now())
  source          MatchImportSource
  status          MatchImportStatus @default(PENDING)
  externalGameId  BigInt
  gameVersion     String?
  gameMode        String?
  gameType        String?
  queueId         Int?
  mapId           Int?
  gameCreation    BigInt?
  durationSeconds Int?
  rawJson         Json
  committedGameId String?
  note            String?

  @@index([status])
  @@index([externalGameId])
  @@map("match_imports")
}
```
`GamePlayerStat` 模型加一行：`extStats Json?`

- [ ] **Step 2: 生成迁移（不自动 apply 到 prod）**

Run: `npx prisma migrate dev --name match_import --create-only`
Expected: 生成 migration.sql（建表 match_imports、加列 extStats、建普通 index）。

- [ ] **Step 3: 在 migration.sql 末尾手加 COMMITTED partial unique index**

```sql
CREATE UNIQUE INDEX "match_imports_external_committed_uniq"
  ON "match_imports" ("externalGameId")
  WHERE "status" = 'COMMITTED';
```

- [ ] **Step 4: apply 到 dev + 重新生成 client**

Run: `npx prisma migrate dev` 然后 `npx prisma generate`
Expected: 迁移成功；`MatchImport` 出现在 Prisma client。

- [ ] **Step 5: commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add MatchImport staging table, extStats, committed partial unique index"
```

---

## Task 3: 把 saveGameDetail 抽成可接收 tx 的内部函数（P1-2，行为不变）

**Files:**
- Modify: `src/lib/tournament/game-detail-service.ts`
- Test: `src/lib/tournament/game-detail-service.test.ts`（现有回归 + 新增 1 例）

- [ ] **Step 1: 重构**

`game-detail-service.ts`：把现有 `db.$transaction(async (tx) => { ...body... })` 的 body 抽到新内部函数；用项目既有的 `Db` 类型（`src/lib/tournament/types.ts`：`Db = PrismaClient | Prisma.TransactionClient`），**不要**用 `Parameters<...>` 或 `as unknown as PrismaClient` 强转（P1-4）：
```ts
import type { Db } from './types';

export async function saveGameDetailTx(
  tx: Db,
  input: { matchId: string; gameId?: string; expectedVersion: number; detail: GameDetailInput; actorUserId: string },
): Promise<{ gameId: string }> {
  // ←—— 原 db.$transaction 回调体原样搬进来（claimMatch(tx,...) 等保持用 tx）
}

// 开启事务的入口函数只接 PrismaClient（契约：能开事务）；不要接 Db 再 cast。
export async function saveGameDetail(
  db: PrismaClient,
  input: { matchId: string; gameId?: string; expectedVersion: number; detail: GameDetailInput; actorUserId: string },
): Promise<{ gameId: string }> {
  return db.$transaction((tx) => saveGameDetailTx(tx, input));
}
```
**类型边界（P1）**：开事务的入口函数（`saveGameDetail`、`commitImport`）签名用 `PrismaClient`；在事务内复用的函数/helper（`saveGameDetailTx`、`rosterByTeam`、映射/查询）用 `Db`。**不做 `as PrismaClient` 强转**，也不要让入口函数表面上接 `Db`（否则有人 `commitImport(tx, ...)` 类型看似合法、运行时炸在 `$transaction`）。

- [ ] **Step 2: 跑现有全部 game-detail 回归**

Run: `npm run test -- game-detail-service`
Expected: 现有用例全 PASS（行为不变是本任务验收点）。

- [ ] **Step 3: 新增「tx 版可在外部事务内调用」测试**

```ts
it('saveGameDetailTx 可在外部事务内被调用并写入', async () => {
  const { t, final } = await toFinalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await testDb.$transaction((tx) =>
    saveGameDetailTx(tx, {
      matchId: final.id, expectedVersion: final.version,
      detail: { winnerTeamId: final.teamAId, blueTeamId: final.teamAId, durationSeconds: 1800,
        playerStats: [...statsFor(final.teamAId!, a, 0), ...statsFor(final.teamBId!, b, 5)] },
      actorUserId: 'u',
    }),
  );
  const g = await testDb.game.findFirst({ where: { matchId: final.id }, include: { playerStats: true } });
  expect(g!.playerStats).toHaveLength(10);
});
```

- [ ] **Step 4: 跑测试 + commit**

Run: `npm run test -- game-detail-service`（PASS）
```bash
git add src/lib/tournament/game-detail-service.ts src/lib/tournament/game-detail-service.test.ts
git commit -m "refactor(game-detail): extract saveGameDetailTx accepting transaction client"
```

---

## Task 4: import-schema + ingest 服务（建暂存）

**Files:**
- Create: `src/lib/tournament/import-schema.ts`
- Create: `src/lib/tournament/import-service.ts`
- Test: `src/lib/tournament/import-service.test.ts`

- [ ] **Step 1: zod（externalGameId 接受 string|number 转 BigInt）**

`import-schema.ts`：
```ts
import { z } from 'zod';
const bigIntish = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((v) => BigInt(v));
const playerSchema = z.object({
  name: z.string().min(1), championId: z.number().int().nonnegative(),
  teamId: z.number().int(), stats: z.record(z.any()),
  participantId: z.number().int().optional(), // 新 capture 带 top-level；旧 summary 可能没有
  spell1Id: z.number().int().optional(), spell2Id: z.number().int().optional(),
});

// pid 解析（P1-1）：优先 top-level participantId，其次 stats.participantId，最后队内顺序 index+1。
// mapping 与 commit 必须用同一个 resolvePid，保证键一致。
export function resolvePid(p: { participantId?: number; stats: Record<string, unknown> }, index: number): number {
  return p.participantId ?? (typeof p.stats?.participantId === 'number' ? (p.stats.participantId as number) : index + 1);
}
export const summarySchema = z.object({
  gameId: bigIntish, gameMode: z.string().optional(), gameType: z.string().optional(),
  queueId: z.number().int().optional(), mapId: z.number().int().optional(),
  gameVersion: z.string().optional(), gameCreation: bigIntish.optional(),
  gameDuration: z.number().int().optional(),
  teams: z.array(z.any()).optional(),
  players: z.array(playerSchema).length(10),
});
export type SummaryInput = z.infer<typeof summarySchema>;
```

- [ ] **Step 2: 写失败测试（ingest 建 PENDING + dup 标志）**

`import-service.test.ts`：
```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { ingestImport } from './import-service';
import sample from '@/lib/test/fixtures/sample-summary.json'; // 见 Step 3

beforeEach(resetDb);
it('ingest 建 PENDING 记录并返回 string 形态 externalGameId', async () => {
  const r = await ingestImport(testDb, sample as any, 'SCRIPT');
  expect(typeof r.externalGameId).toBe('string');
  const row = await testDb.matchImport.findUnique({ where: { id: r.importId } });
  expect(row!.status).toBe('PENDING');
  expect(row!.source).toBe('SCRIPT');
});
```

- [ ] **Step 3: 放真实样例夹具（两种 participantId 形态）**

- `src/lib/test/fixtures/sample-summary.json`：现网真实 `result_*_summary.json`（**无** top-level `participantId`，但 `stats.participantId` 存在）——验证 fallback。
- `src/lib/test/fixtures/sample-summary-with-pid.json`：在上面的基础上给每个 player 加 top-level `participantId`——验证新 capture 形态。
- 另加一个 `resolvePid` 纯函数单测（top-level / stats / index 三条路径），放 `import-schema.test.ts`。

- [ ] **Step 4: 跑确认失败**

Run: `npm run test -- import-service`
Expected: FAIL（`ingestImport` 未定义）。

- [ ] **Step 5: 实现 ingest**

`import-service.ts`：
```ts
import type { PrismaClient } from '@prisma/client';
import { summarySchema } from './import-schema';

export async function ingestImport(db: PrismaClient, raw: unknown, source: 'SCRIPT' | 'UPLOAD') {
  const s = summarySchema.parse(raw);
  const dupCommitted = await db.matchImport.findFirst({
    where: { externalGameId: s.gameId, status: 'COMMITTED' }, select: { id: true },
  });
  const row = await db.matchImport.create({
    data: {
      source, status: 'PENDING', externalGameId: s.gameId,
      gameVersion: s.gameVersion, gameMode: s.gameMode, gameType: s.gameType,
      queueId: s.queueId, mapId: s.mapId, gameCreation: s.gameCreation ?? null,
      durationSeconds: s.gameDuration, rawJson: raw as object,
    },
  });
  return { importId: row.id, externalGameId: row.externalGameId.toString(), duplicateOfCommitted: !!dupCommitted };
}
```

- [ ] **Step 6: 跑测试 + commit**

Run: `npm run test -- import-service`（PASS）
```bash
git add src/lib/tournament/import-schema.ts src/lib/tournament/import-schema.test.ts src/lib/tournament/import-service.ts src/lib/tournament/import-service.test.ts src/lib/test/fixtures/sample-summary.json src/lib/test/fixtures/sample-summary-with-pid.json
git commit -m "feat(import): ingest service + summary schema + sample fixtures"
```

---

## Task 5: 入口路由 + middleware 放行（token 或 admin）

**Files:**
- Create: `src/app/api/tournament/imports/route.ts`
- Modify: `src/middleware.ts`
- Modify: `src/lib/tournament/import-service.ts`（加 resolveImportAuth 纯函数）
- Test: `src/lib/tournament/import-auth.test.ts`

- [ ] **Step 1: 抽鉴权判定为纯函数 + 测试**

`import-service.ts` 增：
```ts
export function resolveImportAuth(bearer: string | null, isAdmin: boolean, envToken: string | undefined):
  { source: 'SCRIPT' | 'UPLOAD' } | { error: 401 } {
  if (envToken && bearer && bearer === envToken) return { source: 'SCRIPT' };
  if (isAdmin) return { source: 'UPLOAD' };
  return { error: 401 };
}
```
`import-auth.test.ts`：
```ts
import { expect, it } from 'vitest';
import { resolveImportAuth } from './import-service';
it('token 命中 => SCRIPT', () => expect(resolveImportAuth('tk', false, 'tk')).toEqual({ source: 'SCRIPT' }));
it('token 为空时不启用 token 分支', () => expect(resolveImportAuth('tk', false, undefined)).toEqual({ error: 401 }));
it('无 token 但 admin => UPLOAD', () => expect(resolveImportAuth(null, true, 'tk')).toEqual({ source: 'UPLOAD' }));
it('都没有 => 401', () => expect(resolveImportAuth(null, false, 'tk')).toEqual({ error: 401 }));
```
Run: `npm run test -- import-auth`（先 FAIL 再实现到 PASS）

- [ ] **Step 2: 路由**

`src/app/api/tournament/imports/route.ts`：
```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ingestImport, resolveImportAuth } from '@/lib/tournament/import-service';

export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const session = await getSession();
  const auth = resolveImportAuth(bearer, session?.user.role === 'ADMIN', process.env.MATCH_IMPORT_TOKEN);
  if ('error' in auth) return NextResponse.json({ error: '未授权' }, { status: 401 });
  try {
    const r = await ingestImport(prisma, await req.json(), auth.source);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'summary 结构不合法' }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 3: middleware 仅精确放行该入口**

`src/middleware.ts` 早返回块加（与 `/api/tournament/public` 同级）：
```ts
if (req.method === 'POST' && pathname === '/api/tournament/imports') return NextResponse.next();
```
不要放行 `/api/tournament/admin/imports/**`。

- [ ] **Step 4: commit**

```bash
git add src/app/api/tournament/imports/route.ts src/middleware.ts src/lib/tournament/import-service.ts src/lib/tournament/import-auth.test.ts
git commit -m "feat(import): ingest endpoint with token-or-admin auth + middleware allow"
```

---

## Task 6: 分阵营花名册 + 自动映射服务

**Files:**
- Modify: `src/lib/tournament/import-service.ts`
- Test: `src/lib/tournament/import-mapping.test.ts`

- [ ] **Step 1: 失败测试（命中/未命中/大小写归一/阵营约束）**

```ts
// 构造：tournament+match(teamA/teamB)+各队 5 名 registration，其中 Player.gameId 用 sample 里的玩家名
it('按 name#tag 在对应阵营内自动映射，未命中标 null', async () => {
  const ctx = await setupMappingCtx(); // helper：见 import-commit.test 复用
  const res = await buildMapping(testDb, ctx.matchId, ctx.blueTeamId, ctx.sample);
  const hit = res.rows.find((r) => r.capturedName === '小捏捏哟#59867');
  expect(hit!.registrationId).toBeTruthy();
  // 蓝方候选只能来自 blueTeam 花名册
  expect(res.rows.filter((r) => r.lcuTeamId === 100).every((r) => r.siteTeamId === ctx.blueTeamId)).toBe(true);
});
```
Run: `npm run test -- import-mapping`（先 FAIL）

- [ ] **Step 2: 实现 roster 查询 + 自动映射**

```ts
type Candidate = { registrationId: string; gameId: string; nickname: string };
type MapRow = { capturedParticipantId: number; capturedName: string; lcuTeamId: number;
  siteTeamId: string; registrationId: string | null; candidates: Candidate[] };

async function rosterByTeam(db: Db, tournamentId: string, teamId: string): Promise<Candidate[]> {
  const tt = await db.tournamentTeam.findFirst({ where: { tournamentId, teamId } });
  if (!tt) return [];
  const rows = await db.tournamentTeamPlayer.findMany({
    where: { tournamentTeamId: tt.id },
    include: { registration: { include: { player: true } } },
  });
  return rows.map((p) => ({ registrationId: p.registrationId, gameId: p.registration.player.gameId, nickname: p.registration.nickname }));
}
const norm = (s: string) => s.trim().toLowerCase();

export async function buildMapping(db: Db, matchId: string, blueTeamId: string, raw: unknown) {
  const s = summarySchema.parse(raw);
  const match = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  if (![match.teamAId, match.teamBId].includes(blueTeamId)) throw new Error('blueTeamId 不属于该对阵');
  const redTeamId = match.teamAId === blueTeamId ? match.teamBId! : match.teamAId!;
  const blue = await rosterByTeam(db, match.tournamentId, blueTeamId);
  const red = await rosterByTeam(db, match.tournamentId, redTeamId);
  const rows: MapRow[] = s.players.map((p, i) => {
    const isBlue = p.teamId === 100;
    const siteTeamId = isBlue ? blueTeamId : redTeamId;
    const candidates = isBlue ? blue : red;
    const hit = candidates.find((c) => norm(c.gameId) === norm(p.name));
    return { capturedParticipantId: resolvePid(p, i), capturedName: p.name, lcuTeamId: p.teamId,
      siteTeamId, registrationId: hit?.registrationId ?? null, candidates };
  });
  return { matchId, blueTeamId, redTeamId, rows };
}
```

- [ ] **Step 3: 跑测试 + commit**

Run: `npm run test -- import-mapping`（PASS）
```bash
git add src/lib/tournament/import-service.ts src/lib/tournament/import-mapping.test.ts
git commit -m "feat(import): roster query + side-scoped name#tag auto-mapping"
```

---

## Task 7: commit 服务（单事务 + 全部校验）（P1-2/3/4/5）

**Files:**
- Modify: `src/lib/tournament/errors.ts`（加 `CONFLICT` code）
- Modify: `src/lib/tournament/route-errors.ts`（加 `CONFLICT: 409`）
- Modify: `src/lib/tournament/import-service.ts`
- Modify: `src/lib/tournament/import-schema.ts`
- Test: `src/lib/tournament/import-commit.test.ts`

- [ ] **Step 0: 先加 CONFLICT 错误码（P1-3，必须先于实现，否则 Task 7 编译失败）**

`src/lib/tournament/errors.ts`：`TournamentErrorCode` 联合类型加 `| 'CONFLICT'`。
`src/lib/tournament/route-errors.ts`：状态映射加 `CONFLICT: 409`（与既有 `VERSION_CONFLICT: 409` 并列）。
> 注：`toResponse` 在 `route-errors.ts`，不是 `errors.ts`——后续 route import 路径以此为准。

- [ ] **Step 1: commit body zod**

`import-schema.ts` 增：
```ts
export const commitSchema = z.object({
  matchId: z.string().min(1),
  expectedVersion: z.number().int(),
  gameIndex: z.number().int().positive(),
  blueTeamId: z.string().min(1),
  mappings: z.array(z.object({ capturedParticipantId: z.number().int(), registrationId: z.string().min(1) })).length(10),
  overrides: z.record(z.object({
    kills: z.number().int().nonnegative().optional(), deaths: z.number().int().nonnegative().optional(),
    assists: z.number().int().nonnegative().optional(), cs: z.number().int().nonnegative().optional(),
    damage: z.number().int().nonnegative().optional(), gold: z.number().int().nonnegative().optional(),
  })).optional(),
});
export type CommitInput = z.infer<typeof commitSchema>;
```

- [ ] **Step 2: 失败测试矩阵（happy + 各拒绝分支）**

`import-commit.test.ts` 覆盖：
1. happy：commit 后生成 Game(index 指定) + 10 GamePlayerStat（championId 为 key）+ 每条 extStats 非空 + MatchImport=COMMITTED + committedGameId 指向该 game。
2. 未满 10 映射 → 400。
3. registrationId 不在其阵营花名册 → 400。
4. 10 个 registrationId 有重复 → 400。
5. 胜负异常（P1-2）：(a) 败方有人 win=true（蓝 5 true / 红 4 false+1 true）→ 400；(b) 未知 LCU teamId（非 100/200）→ 400；(c) 某阵营人数≠5 → 400；(d) 两边都全 win=true → 400。
6. 未知数字 championId → 400。
7. 同 externalGameId 第二次 commit → 409（DB partial unique，service 包成 CONFLICT）。
8. gameIndex 非「下一局」且该 index 无 draft → 409。
```ts
it('happy: 单事务写入 Game+10 stats+extStats 并标 COMMITTED', async () => {
  const ctx = await setupImportCtx(); // 造 match+两队花名册(gameId=sample 玩家名) + ingest sample
  const r = await commitImport(testDb, ctx.importId, {
    matchId: ctx.matchId, expectedVersion: ctx.matchVersion, gameIndex: 1, blueTeamId: ctx.blueTeamId,
    mappings: ctx.fullMappings,
  });
  const imp = await testDb.matchImport.findUnique({ where: { id: ctx.importId } });
  expect(imp!.status).toBe('COMMITTED'); expect(imp!.committedGameId).toBe(r.gameId);
  const stats = await testDb.gamePlayerStat.findMany({ where: { gameId: r.gameId } });
  expect(stats).toHaveLength(10);
  expect(stats.every((s) => s.extStats !== null)).toBe(true);
  expect(stats.every((s) => /^[A-Za-z]/.test(s.championId))).toBe(true); // key 非数字
});
it('重复 gameId 第二次 commit => 409/唯一冲突', async () => { /* 第二个 import 同 gameId，commit 抛 P2002 */ });
```
Run: `npm run test -- import-commit`（先 FAIL）

- [ ] **Step 3: 实现 commitImport（单事务）**

```ts
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Db } from './types';
import { TournamentError } from './errors';
import { saveGameDetailTx } from './game-detail-service';
import { championKeyByNumericId } from './champions';
import { summarySchema, resolvePid, type CommitInput } from './import-schema';

// 入口函数接 PrismaClient（要开事务）；actorUserId 由 route 透传（审计落管理员，不固定 'import'）。
export async function commitImport(db: PrismaClient, importId: string, body: CommitInput, actorUserId: string) {
  try {
    return await db.$transaction(async (tx) => {
      const imp = await tx.matchImport.findUniqueOrThrow({ where: { id: importId } });
      if (imp.status !== 'PENDING') throw new TournamentError('VALIDATION', '该导入已处理');
      const s = summarySchema.parse(imp.rawJson);
      const match = await tx.match.findUniqueOrThrow({ where: { id: body.matchId } });
      if (![match.teamAId, match.teamBId].includes(body.blueTeamId)) throw new TournamentError('VALIDATION', 'blueTeamId 不属于该对阵');
      const redTeamId = match.teamAId === body.blueTeamId ? match.teamBId! : match.teamAId!;

      // —— LCU 阵营 + 胜负严格校验（P1-2）——
      for (const p of s.players) if (p.teamId !== 100 && p.teamId !== 200)
        throw new TournamentError('VALIDATION', `未知 LCU teamId：${p.teamId}`);
      const team100 = s.players.filter((p) => p.teamId === 100);
      const team200 = s.players.filter((p) => p.teamId === 200);
      if (team100.length !== 5 || team200.length !== 5)
        throw new TournamentError('VALIDATION', 'LCU 两队人数必须各 5 人');
      const allWin = (arr: typeof team100) => arr.every((p) => (p.stats as Record<string, unknown>).win === true);
      const allLose = (arr: typeof team100) => arr.every((p) => (p.stats as Record<string, unknown>).win === false);
      const blue100 = body.blueTeamId; // LCU 100 → blueTeamId
      let winnerTeamId: string;
      if (allWin(team100) && allLose(team200)) winnerTeamId = blue100;
      else if (allLose(team100) && allWin(team200)) winnerTeamId = redTeamId;
      else throw new TournamentError('VALIDATION', 'summary 胜负字段异常（必须一边 5 人全胜、另一边 5 人全负）');

      const sideRegs = async (teamId: string) =>
        new Set((await rosterByTeam(tx, match.tournamentId, teamId)).map((p) => p.registrationId));
      const blueRegs = await sideRegs(body.blueTeamId);
      const redRegs = await sideRegs(redTeamId);

      const byPid = new Map(body.mappings.map((m) => [m.capturedParticipantId, m.registrationId]));
      if (new Set(body.mappings.map((m) => m.registrationId)).size !== 10)
        throw new TournamentError('VALIDATION', '选手映射重复或不足 10 人');

      const playerStats = s.players.map((p, i) => {
        const st = p.stats as Record<string, any>;
        const pid = resolvePid(p, i);
        const regId = byPid.get(pid);
        if (!regId) throw new TournamentError('VALIDATION', `选手「${p.name}」未映射`);
        const isBlue = p.teamId === 100;
        const siteTeamId = isBlue ? body.blueTeamId : redTeamId;
        if (!(isBlue ? blueRegs : redRegs).has(regId)) throw new TournamentError('VALIDATION', `选手「${p.name}」映射到了非本阵营选手`);
        const key = championKeyByNumericId(p.championId);
        if (!key) throw new TournamentError('VALIDATION', `未知英雄 id：${p.championId}，请更新英雄数据`);
        const o = body.overrides?.[String(pid)] ?? {};
        return {
          teamId: siteTeamId, registrationId: regId, championId: key,
          kills: o.kills ?? st.kills ?? 0, deaths: o.deaths ?? st.deaths ?? 0, assists: o.assists ?? st.assists ?? 0,
          cs: o.cs ?? ((st.totalMinionsKilled ?? 0) + (st.neutralMinionsKilled ?? 0)),
          damage: o.damage ?? st.totalDamageDealtToChampions ?? 0, gold: o.gold ?? st.goldEarned ?? 0,
          _ext: { ...st, championId: p.championId, championName: (p as any).championName, spell1Id: (p as any).spell1Id, spell2Id: (p as any).spell2Id },
        };
      });

      // gameIndex 语义
      const existing = await tx.game.findFirst({
        where: { matchId: match.id, index: body.gameIndex }, include: { playerStats: { take: 1 } } });
      const count = await tx.game.count({ where: { matchId: match.id } });
      let gameIdArg: string | undefined;
      if (existing) {
        if (!existing.isDraft || existing.playerStats.length > 0) throw new TournamentError('CONFLICT', `第 ${body.gameIndex} 局已有正式数据`);
        gameIdArg = existing.id;
      } else if (body.gameIndex !== count + 1) {
        throw new TournamentError('CONFLICT', `第 ${body.gameIndex} 局不存在且非下一局`);
      }

      const { gameId } = await saveGameDetailTx(tx, {
        matchId: match.id, gameId: gameIdArg, expectedVersion: body.expectedVersion,
        detail: { winnerTeamId, blueTeamId: body.blueTeamId, durationSeconds: s.gameDuration ?? null,
          playerStats: playerStats.map(({ _ext, ...ps }) => ps) },
        actorUserId,
      });

      for (const ps of playerStats) {
        await tx.gamePlayerStat.update({
          where: { gameId_registrationId: { gameId, registrationId: ps.registrationId } },
          data: { extStats: ps._ext },
        });
      }

      await tx.matchImport.update({ where: { id: importId }, data: { status: 'COMMITTED', committedGameId: gameId } });
      return { gameId };
    });
  } catch (e) {
    // partial unique（同 gameId 已 COMMITTED）→ 包成 CONFLICT，route 统一走 toResponse
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002')
      throw new TournamentError('CONFLICT', '这局已导入过');
    throw e;
  }
}
```
> 注：`saveGameDetailTx` 内部已对 stats 做 5+5/championKey/registration 校验；本服务额外加阵营/胜负/数字 id/去重/gameIndex。`overrides` 以 participantId(string) 为键。`winnerTeamId` 严格由 5全胜/5全负派生，不接受前端传值。

- [ ] **Step 4: 跑测试矩阵 + commit**

Run: `npm run test -- import-commit`（全 PASS）
```bash
git add src/lib/tournament/import-service.ts src/lib/tournament/import-schema.ts src/lib/tournament/import-commit.test.ts
git commit -m "feat(import): single-transaction commit with side/winner/champion/dedup/index validation"
```

---

## Task 8: admin 路由（list/detail/mapping/commit/discard）

**Files:**
- Create: `src/app/api/tournament/admin/imports/route.ts`（GET 列表）
- Create: `src/app/api/tournament/admin/imports/[id]/route.ts`（GET 详情）
- Create: `src/app/api/tournament/admin/imports/[id]/mapping/route.ts`（GET ?matchId&blueTeamId）
- Create: `src/app/api/tournament/admin/imports/[id]/commit/route.ts`（POST）
- Create: `src/app/api/tournament/admin/imports/[id]/discard/route.ts`（POST）

> CONFLICT 错误码已在 Task 7 Step 0 加好；`toResponse` 在 `route-errors.ts`；P2002 已在 `commitImport` 内包成 `CONFLICT`，route 不再单独判 P2002。

- [ ] **Step 1: 五个 route（requireAdmin + zod；BigInt 转 string；actorUserId 透传）**

commit route 示例：
```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { toResponse } from '@/lib/tournament/route-errors';
import { commitImport } from '@/lib/tournament/import-service';
import { commitSchema } from '@/lib/tournament/import-schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(); if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = commitSchema.parse(await req.json());
    const r = await commitImport(prisma, id, body, guard.session.user.id); // actorUserId = 管理员
    return NextResponse.json({ ok: true, gameId: r.gameId });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e); // CONFLICT→409 / VALIDATION→422 等由 route-errors 映射
  }
}
```
list/detail route：返回前把 `externalGameId`、`gameCreation` 用 `.toString()`（建议在 service 层提供统一 DTO，避免每 route 重复）。mapping route 调 `buildMapping`。discard route 把 status 置 DISCARDED（仅 PENDING 可丢弃）。

- [ ] **Step 3: 路由 smoke 测试 + commit**

至少 1 个集成 smoke（带 admin session mock）走 ingest→mapping→commit；service 级已覆盖业务分支。
```bash
git add src/app/api/tournament/admin/imports src/lib/tournament/errors.ts
git commit -m "feat(import): admin routes list/detail/mapping/commit/discard"
```

---

## Task 9: admin 审核 UI

**Files:**
- Create: `src/app/admin/imports/page.tsx`
- Create: `src/components/admin/imports/ImportsManager.tsx`、`ImportReviewDialog.tsx`
- Modify: `src/app/admin/page.tsx`（加入口卡片，照现有卡片写法）

- [ ] **Step 1: 列表组件**

`ImportsManager.tsx`：fetch `GET /api/tournament/admin/imports?status=PENDING`，表格列：时间/来源/gameId/模式/是否重复/操作（审核、丢弃）。照 `RegistrationsManager.tsx` 的本地 state + fetch + toast 模式。

- [ ] **Step 2: 审核弹窗**

`ImportReviewDialog.tsx`：
- 选 Match（下拉，取当前赛事对阵）+ blueTeamId（teamA/teamB 二选一）+ gameIndex。
- 选完拉 `GET .../mapping?matchId=&blueTeamId=`，渲染 10 行：抓取名 + 阵营 + 自动命中的 registration（未命中标红，提供本阵营候选下拉）。
- 每人 6 项数值可编辑（默认填 summary 值），照 `GameDetailEditor.tsx` 的输入与校验风格。
- 提交 `POST .../commit`（带 expectedVersion，从所选 Match 取）；成功 toast + 刷新列表。

- [ ] **Step 3: 「上传 JSON」按钮**

`ImportsManager` 加上传：读文件 → `POST /api/tournament/imports`（admin 登录态）→ 刷新列表。

- [ ] **Step 4: 入口卡片 + commit**

`src/app/admin/page.tsx` 加「对局导入」卡片链到 `/admin/imports`。
```bash
git add src/app/admin/imports src/components/admin/imports src/app/admin/page.tsx
git commit -m "feat(import): admin review UI (list, review dialog, json upload)"
```

---

## Task 10: lol-capture 上传（--server/--token）

**Files:**
- Create: `tools/lol-capture/upload.go`
- Modify: `tools/lol-capture/main.go`（解析参数 + 调用上传）
- Test: `tools/lol-capture/upload_test.go`

- [ ] **Step 1: 失败测试（构造 summary→POST 到 httptest）**

`upload_test.go`：起 `httptest.Server`，校验请求头 `Authorization: Bearer tk`、body 含 gameId；`uploadSummary(url, "tk", bytes)` 返回 nil error；非 2xx 返回 error。

- [ ] **Step 2: 实现 upload.go**

```go
package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func uploadSummary(server, token string, summaryJSON []byte) error {
	req, err := http.NewRequest("POST", strings.TrimRight(server, "/")+"/api/tournament/imports", bytes.NewReader(summaryJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("服务器返回 HTTP %d：%s", resp.StatusCode, truncate(string(b), 300))
	}
	return nil
}
```

- [ ] **Step 3: playerSummary 加 top-level participantId（P1-1）**

`tools/lol-capture/main.go`：`playerSummary` 结构加 `ParticipantID int json:"participantId"`；`buildSummary` 里赋 `ParticipantID: p.ParticipantID`（generic 解析的 `Participants[].ParticipantID` 已有该字段）。这样 summary 顶层稳定带 participantId，服务端不再依赖 `stats.participantId`。重新生成一份 `sample-summary-with-pid.json` 覆盖测试夹具。

- [ ] **Step 4: main.go 接参数 + 调用**

`main.go`：解析 `--server` `--token`（照现有 `--custom-only` 的 os.Args 扫描或换 flag 包）；生成 summary 并**先本地落盘**后，若 server+token 非空，则 `json.Marshal(summary)` 上传，打印成功/失败原因；上传失败不影响本地文件。

- [ ] **Step 5: 跑 go test + 交叉编译 + commit**

Run: `cd tools/lol-capture && go test ./... && go vet ./... && GOOS=windows GOARCH=amd64 go build -o /tmp/lol-capture.exe .`
```bash
git add tools/lol-capture/upload.go tools/lol-capture/main.go tools/lol-capture/upload_test.go
git commit -m "feat(lol-capture): optional --server/--token upload to import endpoint"
```

---

## Self-Review（spec 覆盖核对）

- §4.1 partial unique + BigInt → Task 2 / Task 4 / Task 8 ✓
- §4.2 extStats → Task 2（列）/ Task 7（写入）✓
- §4.3 数字→key → Task 1 / Task 7 ✓
- §5.1 入口 token-or-admin → Task 5 ✓
- §5.2 list/detail/mapping → Task 6 / Task 8 ✓
- §5.3 commit 单事务 + expectedVersion + gameIndex + 校验 → Task 3 / Task 7 ✓
- §6 middleware 精确放行 → Task 5 ✓
- §7 分阵营映射 + 胜负派生 → Task 6 / Task 7 ✓
- §8 UI → Task 9 ✓
- §9 lol-capture → Task 10 ✓
- §10 错误码 → Task 7（VALIDATION/CONFLICT）/ Task 8（409/422）✓
- §11 测试 → 每任务含 vitest/go test ✓

## 风险/实现期对齐点

- `CONFLICT` 错误码在 Task 7 Step 0 加（errors.ts + route-errors.ts），先于 commitImport 实现。
- `participantId`：mapping/commit 统一用 `resolvePid`（top-level `participantId` → `stats.participantId` → 队内顺序 index+1）；Task 10 给 capture 补 top-level，夹具两形态都测。
- 审计 `actorUserId`：commit route 透传管理员 `guard.session.user.id`，不写死 `'import'`。
- Task 8 list/detail 的 BigInt 序列化：在 service 层提供 DTO（统一 `toString`），避免每个 route 重复。
- 类型边界：开事务入口（`saveGameDetail`/`commitImport`）接 `PrismaClient`，事务内 helper 接 `Db`，无 cast。
