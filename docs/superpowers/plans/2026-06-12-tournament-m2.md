# Tournament M2 实施计划 — 局级数据 / 数据榜 / 选手页

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 M2（spec：`docs/superpowers/specs/2026-06-12-tournament-m2-design.md` rev.2，codex-PASSED；引用父 spec `docs/superpowers/specs/2026-06-12-tournament-v2-design.md` §3 局级字段/§4 边界约定/§6 统计语义）：英雄静态表管线 + `ChampionSelect`；局级详细录入 `saveGameDetail`（草稿/转正/三态 bans·stats·**scalar 字段**/完整性校验/下游保护/CAS）；决赛完赛自动 FINISHED；数据榜纯函数 `computeLeaderboard` + 选手赛季统计 `getPlayerSeasonStats`；公开读模型收窄（去 version/config，草稿局不泄露）+ 管理端读模型 `getAdminTournamentState` / 公开比赛详情 `getPublicMatchDetail`；新路由（admin/state、games PUT、public match/leaderboard/player）；hooks 拆分为 `useAdminTournamentState` / 收窄后的 `useTournamentState`；UI（GameDetailEditor / ScoreDialog 整合 / 公开比赛详情页 / 数据榜 Tab / 选手页）；集成测试 + E2E 实跑。**零 schema 变更零迁移**（Game/GameBanPick/GamePlayerStat 字段 M1 已建全）。

**Architecture:** 沿用 CRUD + 派生计算 + 轻量审计。局级写入由新 `game-detail-service.ts` 承担，复用 score-service 的 `claimMatch`（CAS）/`resettleMatch`（结算+晋级）/下游保护，故把 `assertDownstreamClean`、`resettleMatch`、`winsNeeded`、`claimMatch` 从 score-service **导出**给 game-detail-service 复用（不复制逻辑）。决赛自动 FINISHED 作为 score-service 内部 hook，挂在 `resettleMatch`/`setWalkover`/`cancelMatch` 结算路径末尾，game-detail-service 经 `resettleMatch` 间接获得。读模型纯派生（`standings`/`bracket`/新 `leaderboard`）。service 层纯函数（`db` 入参，`Db = PrismaClient | Prisma.TransactionClient`）。

**Tech Stack:** Next.js 15 App Router、Prisma 5 + PostgreSQL 16、Zod、vitest（unit 项目定义于 vitest.workspace.ts，DB 集成测试基建已存在）、SSE（已上线，独立 tournament-bus，只广播失效信号）。

**范围外**（spec §10）：审计日志查看页；跨赛季生涯汇总页；BP 5ban5pick 模板强制；英雄图标本地打包；数据导入导出。

**约定**：所有命令在仓库根执行。测试命令 `npx vitest run <file> --project unit`（unit 项目定义于 vitest.workspace.ts）；全量回归 `npx vitest run`。每个 Task 结束必须 commit（前缀 `feat(tournament)` / `feat(season)` / `test` / `chore`）。现有模式参考：纯函数 service `src/lib/tournament/standings.ts`；DB service `src/lib/tournament/score-service.ts`、`groups-service.ts`；错误类 `src/lib/tournament/errors.ts`（`TournamentError(code, msg)`）；错误→HTTP `src/lib/tournament/route-errors.ts`；审计 `src/lib/tournament/audit.ts`（`writeAudit(tx, {...})`）；测试 DB `src/lib/test/db.ts`（`resetDb`/`testDb`）；夹具 `src/lib/tournament/test-fixtures.ts`（`createTestTournament`/`seedTeamsForSeason`/`seedSeasonWithTeams`/`CFG_2x4x2`）；路由守卫 `src/lib/api-guards.ts`（`requireAdmin()` → `{error}` 或 `{session}`，`guard.session.user.id`）；SSE `src/server/tournament-bus.ts`（`publishTournament({ type:'tournament.invalidated' })`）；UI kit `src/components/ui/*`（Dialog/Select/Table/Tabs/Badge/Input/Button/Label/Card；**无 command.tsx**）。

**关键命名（全计划一致）**：`saveGameDetail`、`computeLeaderboard`、`getPlayerSeasonStats`、`getAdminTournamentState`、`getPublicMatchDetail`、`getChampions`、`championIconUrl`、`isChampionKey`、`useAdminTournamentState`、`GameDetailInput`、`GameDetailEditor`、`ChampionSelect`。

**三态语义（全计划一致——types / Zod / service / editor payload 必须完全相同）**：对 `bans` / `playerStats` / `blueTeamId` / `durationSeconds` / `mvpRegistrationId` 五个块/字段：`undefined`（缺省）= **保留** 已有值；`null` = **清空**；具体值（array / string / number）= **设置/整体替换**。`winnerTeamId` 例外：`undefined`=保留；`null` 仅对**新建局**或**已是草稿的既有局**合法（置/留草稿），**已转正局传 null 拒绝**（清胜负请删局）；具体值=转正/改判。

---

### Task 1: champions 静态表 + champions.ts（轻量测试）

spec §2。拉 Data Dragon 生成仓库内 JSON（构建产物可重生成，服务器不依赖外网），封装查询/图标/校验。`isChampionKey` 由 `Set` 支撑，供 `saveGameDetail` 强校验 BP/stats 的 `championId ∈ 静态表`。

**Files:**
- Create: `scripts/build-champions.mjs`
- Create: `src/data/champions.json`（脚本生成并提交）
- Create: `src/lib/tournament/champions.ts`
- Create: `src/lib/tournament/champions.test.ts`
- Modify: `package.json`（加 `"build:champions"` script）

- [ ] **Step 1: 写生成脚本** — `scripts/build-champions.mjs`：

```js
// 拉取 Riot Data Dragon 最新版本的中文英雄表 → src/data/champions.json
// 用法：node scripts/build-champions.mjs  （需联网；产物提交进仓库）
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/champions.json');

async function main() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const version = versions[0];
  const data = await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`)
  ).json();
  const champions = Object.values(data.data)
    .map((c) => ({ key: c.id, name: c.name, title: c.title }))
    .sort((a, b) => a.key.localeCompare(b.key));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ version, champions }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${champions.length} champions @ ${version} → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 运行脚本生成 JSON（本任务一次性联网执行）** — `node scripts/build-champions.mjs`
  Expected: 打印 `wrote <N> champions @ <ver>`，生成 `src/data/champions.json`，形如：

```json
{
  "version": "15.x.x",
  "champions": [
    { "key": "Aatrox", "name": "亚托克斯", "title": "暗裔剑魔" },
    { "key": "Ahri", "name": "阿狸", "title": "九尾妖狐" }
  ]
}
```

> 若本地无网络：临时手写一个 ≥3 条的最小 JSON（含 `version` 与按 key 排序的 `champions`）提交，并在 commit message 注明「champions.json 待联网重生成」。`build:champions` 脚本保证可随时重生成。

- [ ] **Step 3: 写 champions.ts** — `src/lib/tournament/champions.ts`：

```ts
import data from '@/data/champions.json';

export type Champion = { key: string; name: string; title: string };

const CHAMPIONS: Champion[] = data.champions;
const KEY_SET = new Set(CHAMPIONS.map((c) => c.key));
const VERSION: string = data.version;

/** 全部英雄（已按 key 排序，来自构建产物 JSON）。 */
export function getChampions(): Champion[] {
  return CHAMPIONS;
}

/** Data Dragon 头像 URL；加载失败 UI 退化为英雄名文字（不做本地图片包）。 */
export function championIconUrl(key: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${key}.png`;
}

/** key 是否为合法英雄（saveGameDetail 后端强校验 BP/stats championId ∈ 此集合）。 */
export function isChampionKey(key: string): boolean {
  return KEY_SET.has(key);
}

/** 英雄名 / null（找不到）——读模型解析 championId → 中文名用。 */
export function championName(key: string): string | null {
  return CHAMPIONS.find((c) => c.key === key)?.name ?? null;
}
```

> `tsconfig.json` 已有 `resolveJsonModule`（Next 默认开启）；若 import json 报错，确认 `"resolveJsonModule": true`。

- [ ] **Step 4: 写测试** — `src/lib/tournament/champions.test.ts`：

```ts
import { expect, it } from 'vitest';
import { getChampions, isChampionKey, championIconUrl, championName } from './champions';

it('champions.json 非空且 key 唯一', () => {
  const all = getChampions();
  expect(all.length).toBeGreaterThan(0);
  const keys = all.map((c) => c.key);
  expect(new Set(keys).size).toBe(keys.length);
});

it('每条含 key/name/title', () => {
  for (const c of getChampions()) {
    expect(typeof c.key).toBe('string');
    expect(c.name.length).toBeGreaterThan(0);
    expect(typeof c.title).toBe('string');
  }
});

it('isChampionKey 命中已知 key、拒绝未知', () => {
  const first = getChampions()[0].key;
  expect(isChampionKey(first)).toBe(true);
  expect(isChampionKey('__not_a_champion__')).toBe(false);
});

it('championIconUrl 含 key 与 cdn 域', () => {
  const url = championIconUrl('Ahri');
  expect(url).toContain('Ahri.png');
  expect(url).toContain('ddragon.leagueoflegends.com');
});

it('championName 解析与未命中', () => {
  const c = getChampions()[0];
  expect(championName(c.key)).toBe(c.name);
  expect(championName('__nope__')).toBeNull();
});
```

- [ ] **Step 5: Run 确认 PASS** — `npx vitest run src/lib/tournament/champions.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 6: 加 package.json script** — 在 `"scripts"` 中加 `"build:champions": "node scripts/build-champions.mjs"`。

- [ ] **Step 7: Commit**

```bash
git add scripts/build-champions.mjs src/data/champions.json \
  src/lib/tournament/champions.ts src/lib/tournament/champions.test.ts package.json
git commit -m "feat(tournament): Data Dragon champions table + champions.ts helpers"
```

---

### Task 2: score-service 复用导出 + 决赛自动 FINISHED（TDD）

spec §4 + 父 spec §4 边界约定。两件事合并（都改 score-service，且 game-detail-service 依赖前者导出）：
1. 把 `assertDownstreamClean`、`resettleMatch`、`winsNeeded`、`claimMatch` 改为 **导出**（game-detail-service 复用，不复制）。
2. 决赛完赛自动 `tournament.status='FINISHED'`，结果被回收则回退 `KNOCKOUT`——挂在 `resettleMatch` / `setWalkover` / `cancelMatch` 结算末尾。

**决赛判定**（父 spec §3 晋级模型）：KNOCKOUT 阶段、`roundKey` 非空、且**无 outgoing WINNER 边**的 match（即 `matchAdvancementEdge` 中无 `fromMatchId=该 match & outcome=WINNER`）。CFG_2x4x2 中即 FINAL 那场。

**Files:**
- Modify: `src/lib/tournament/score-service.ts`
- Modify: `src/lib/tournament/score-service.test.ts`

- [ ] **Step 1: 写失败测试** — 在 `score-service.test.ts` 顶部确认/补充 import：

```ts
import { recordGame, deleteGame, setWalkover, cancelMatch } from './score-service';
import { closeGroupStage } from './bracket-service';
```

末尾追加 helper 与用例（`setupGroupStage` 已在该测试文件——Task 3 Step 2 抽到共享 helper 后改为 import；本 Task 先沿用现有定义）：

```ts
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
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/score-service.test.ts --project unit`
  Expected: FAIL（决赛录满后 tournament 仍为 KNOCKOUT；自动 FINISHED 未实现）。

- [ ] **Step 3: 实现** — 改 `score-service.ts`：

(a) 把 helper 改为导出（供 game-detail-service 复用）——`claimMatch`、`assertDownstreamClean`、`resettleMatch` 加 `export`，`winsNeeded` 加 `export`：

```ts
export async function claimMatch(tx: Db, matchId: string, expectedVersion: number): Promise<Match> { /* 原体不变 */ }
export function winsNeeded(bestOf: number): number { return Math.ceil(bestOf / 2); }
export async function assertDownstreamClean(db: Db, matchId: string): Promise<void> { /* 原体不变 */ }
export async function resettleMatch(tx: Db, matchId: string): Promise<void> { /* 见 (c) */ }
```

(b) 新增决赛判定与状态同步 helper（放在 `propagate` 之后）：

```ts
/** 该 match 是否为决赛：KNOCKOUT 阶段、roundKey 非空、无 outgoing WINNER 边。 */
async function isFinalMatch(tx: Db, matchId: string): Promise<boolean> {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    select: { roundKey: true, stage: { select: { type: true } } },
  });
  if (!m || m.roundKey === null || m.stage.type !== 'KNOCKOUT') return false;
  const out = await tx.matchAdvancementEdge.count({ where: { fromMatchId: matchId, outcome: 'WINNER' } });
  return out === 0;
}

/** 决赛结果变化后同步 tournament.status：有 winner → FINISHED；winner 回收 → 回退 KNOCKOUT。 */
async function syncFinalStatus(tx: Db, matchId: string, hasWinner: boolean): Promise<void> {
  if (!(await isFinalMatch(tx, matchId))) return;
  const m = (await tx.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } }))!;
  if (hasWinner) {
    await tx.tournament.update({ where: { id: m.tournamentId }, data: { status: 'FINISHED' } });
  } else {
    const t = await tx.tournament.findUnique({ where: { id: m.tournamentId }, select: { status: true } });
    if (t?.status === 'FINISHED')
      await tx.tournament.update({ where: { id: m.tournamentId }, data: { status: 'KNOCKOUT' } });
  }
}
```

(c) 在 `resettleMatch` 末尾（`propagate` 之后）追加同步：

```ts
export async function resettleMatch(tx: Db, matchId: string): Promise<void> {
  // … 原体到 propagate(tx, matchId, settledWinner) …
  await propagate(tx, matchId, settledWinner);
  await syncFinalStatus(tx, matchId, settledWinner !== null);   // 新增
}
```

(d) `setWalkover` 末尾 `propagate(tx, match.id, input.winnerTeamId)` 之后追加 `await syncFinalStatus(tx, match.id, true);`；`cancelMatch` 末尾 `propagate(tx, match.id, null)` 之后追加 `await syncFinalStatus(tx, match.id, false);`。

> `resetTournament`（merge plan Task 6）已把 status 回 SETUP 并重建骨架，不经 resettle/walkover/cancel，不受影响。

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/score-service.test.ts --project unit`
  Expected: PASS（新 4 用例 + 既有用例全绿）。

- [ ] **Step 5: 全量回归** — `npx vitest run`
  Expected: 全 PASS（确认导出与 hook 不破坏既有套件；既有 integration.test.ts 只断言 match.status，决赛打满后 tournament 变 FINISHED 不影响其断言）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/score-service.ts src/lib/tournament/score-service.test.ts
git commit -m "feat(tournament): export resettle/downstream/claim helpers; auto-FINISHED on finals settle"
```

---

### Task 3: game-detail-service（M2 核心，TDD）

spec §3 + 父 spec §3 字段/§4 校验/§6 语义。新建 `saveGameDetail`：草稿/转正、三态（bans/stats/scalar 字段）、完整性校验、下游保护、`resettleMatch`、审计。复用 Task 2 导出的 `claimMatch`/`assertDownstreamClean`/`resettleMatch`。

**Files:**
- Create: `src/lib/tournament/game-detail-service.ts`
- Create: `src/lib/tournament/game-detail-service.test.ts`
- Create: `src/lib/tournament/score-service.test-helpers.ts`（抽取 `setupGroupStage`，被多个测试共用）
- Modify: `src/lib/tournament/score-service.test.ts`（改 import 共享 `setupGroupStage`）
- Modify: `src/lib/tournament/test-fixtures.ts`（新增 `expandRosterTo5`，凑每队 5 人快照）

- [ ] **Step 1: 抽 setupGroupStage 到共享 helper** — Create `src/lib/tournament/score-service.test-helpers.ts`：

```ts
import { testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

/** 建赛事 + 分组 + 确认 → GROUP_STAGE。返回 { t, teamIds, groups, seasonId }。 */
export async function setupGroupStage() {
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
  return { t, teamIds, groups, seasonId };
}
```

> `*.test-helpers.ts` 不被 vitest 收集为测试文件（文件名无 `.test.` 中缀 + 无顶层 `it`）。在 `score-service.test.ts` 删除内联 `setupGroupStage`，改 `import { setupGroupStage } from './score-service.test-helpers';`（Task 2 用例同步改用 import）。

- [ ] **Step 2: test-fixtures.ts 追加 expandRosterTo5** — 现有 `seedTeamsForSeason` 每队仅 1 名 MID slot → 快照每队 1 人。`saveGameDetail` 要求 stats 双方各 5 且 ∈ 快照，故需「每队 5 人」夹具。追加：

```ts
/** 把指定 tournament 内某队的快照补到 5 名 registration（直接造 reg + tournamentTeamPlayer，绕过 slot），返回该队 5 个 registrationId。 */
export async function expandRosterTo5(tournamentId: string, teamId: string): Promise<string[]> {
  const team = (await testDb.team.findUnique({ where: { id: teamId } }))!;
  const tt = (await testDb.tournamentTeam.findFirst({ where: { tournamentId, teamId } }))!;
  const regIds: string[] = (
    await testDb.tournamentTeamPlayer.findMany({ where: { tournamentTeamId: tt.id }, select: { registrationId: true } })
  ).map((x) => x.registrationId);
  let i = regIds.length;
  while (regIds.length < 5) {
    const player = await testDb.player.create({
      data: { gameId: `p-${teamId.slice(-4)}-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `选手${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId: team.seasonId, playerId: player.id, nickname: `选手${i}`,
        primaryPositions: ['MID'], secondaryPositions: [], currentRank: 'GOLD', peakRank: 'PLATINUM',
        cost: 100, status: 'ACTIVE',
      },
    });
    await testDb.tournamentTeamPlayer.create({ data: { tournamentTeamId: tt.id, registrationId: reg.id } });
    regIds.push(reg.id);
    i++;
  }
  return regIds.slice(0, 5);
}
```

- [ ] **Step 3: 写失败测试** — `src/lib/tournament/game-detail-service.test.ts`：

```ts
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
  cur = (await testDb.game.findUnique({ where: { id: g.id }, include: { playerStats: true } }))!;
  expect(cur.playerStats).toHaveLength(0);
  expect(cur.mvpRegistrationId).toBeNull();
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
```

- [ ] **Step 4: Run 确认 FAIL** — `npx vitest run src/lib/tournament/game-detail-service.test.ts --project unit`
  Expected: FAIL（`saveGameDetail` 未导出 → import error）。

- [ ] **Step 5: 实现 game-detail-service.ts** — `src/lib/tournament/game-detail-service.ts`：

```ts
import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritable } from './guards';
import { isChampionKey } from './champions';
import { assertDownstreamClean, claimMatch, resettleMatch } from './score-service';

export type BanInput = { teamId: string; type: 'BAN' | 'PICK'; championId: string; order: number };
export type StatInput = {
  teamId: string; registrationId: string; championId: string;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
};

/** 三态：undefined=保留 / null=清空 / value=设置（bans·stats·scalar 统一） */
export type GameDetailInput = {
  winnerTeamId?: string | null;      // undefined 保留；null 仅新建/既有草稿合法（转正后传 null 拒绝）
  blueTeamId?: string | null;
  durationSeconds?: number | null;
  mvpRegistrationId?: string | null;
  bans?: BanInput[] | null;
  playerStats?: StatInput[] | null;
};

const MAX_DURATION = 7200;

export async function saveGameDetail(
  db: PrismaClient,
  input: { matchId: string; gameId?: string; expectedVersion: number; detail: GameDetailInput; actorUserId: string },
): Promise<{ gameId: string }> {
  const d = input.detail;
  return db.$transaction(async (tx) => {
    const match = await claimMatch(tx, input.matchId, input.expectedVersion); // CAS（version+1）
    await assertSeasonWritable(tx, match.tournamentId);
    if (match.status === 'CANCELED' || match.status === 'WALKOVER')
      throw new TournamentError('INVALID_STATE', '该比赛状态不允许录入');
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');

    const sides = [match.teamAId, match.teamBId];

    // —— 既有局 or 新建局 ——
    let game: { id: string; index: number; isDraft: boolean; winnerTeamId: string | null };
    if (input.gameId) {
      const existing = await tx.game.findFirst({ where: { id: input.gameId, matchId: match.id } });
      if (!existing) throw new TournamentError('VALIDATION', '该局不属于此比赛');
      game = existing;
    } else {
      const count = await tx.game.count({ where: { matchId: match.id } });
      if (count >= match.bestOf) throw new TournamentError('VALIDATION', '局数已达上限');
      game = await tx.game.create({ data: { matchId: match.id, index: count + 1, isDraft: true } });
    }

    // —— winnerTeamId 三态 + 草稿/转正 ——
    let nextWinner = game.winnerTeamId; // 默认保留
    let nextIsDraft = game.isDraft;
    if (d.winnerTeamId !== undefined) {
      if (d.winnerTeamId === null) {
        if (!game.isDraft && input.gameId)
          throw new TournamentError('VALIDATION', '已转正局不可退回草稿，清胜负请删局');
        nextWinner = null;
        nextIsDraft = true;
      } else {
        if (!sides.includes(d.winnerTeamId))
          throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
        nextWinner = d.winnerTeamId;
        nextIsDraft = false;
      }
    }
    if (input.gameId && !game.isDraft && nextWinner === null)
      throw new TournamentError('VALIDATION', '已转正局必须有胜者');

    const willChangeResult = d.winnerTeamId !== undefined && d.winnerTeamId !== game.winnerTeamId;
    // 改判/新增转正局可能改变下游 → 做下游保护
    if (match.status === 'FINISHED' || willChangeResult) {
      await assertDownstreamClean(tx, match.id);
    }

    // —— scalar 三态：blueTeamId / durationSeconds ——
    const scalarData: Record<string, unknown> = {};
    if (d.blueTeamId !== undefined) {
      if (d.blueTeamId !== null && !sides.includes(d.blueTeamId))
        throw new TournamentError('VALIDATION', '蓝方必须是比赛双方之一');
      scalarData.blueTeamId = d.blueTeamId;
    }
    if (d.durationSeconds !== undefined) {
      if (d.durationSeconds !== null && (!Number.isInteger(d.durationSeconds) || d.durationSeconds < 1 || d.durationSeconds > MAX_DURATION))
        throw new TournamentError('VALIDATION', `时长须在 1..${MAX_DURATION} 秒`);
      scalarData.durationSeconds = d.durationSeconds;
    }

    // —— bans 三态 ——
    if (d.bans !== undefined) {
      await tx.gameBanPick.deleteMany({ where: { gameId: game.id } });
      if (d.bans !== null) {
        validateBans(d.bans, sides);
        for (const b of d.bans)
          await tx.gameBanPick.create({ data: { gameId: game.id, teamId: b.teamId, type: b.type, championId: b.championId, order: b.order } });
      }
    }

    // —— playerStats 三态（清空连带 mvp）——
    let statsClearedMvp = false;
    if (d.playerStats !== undefined) {
      await tx.gamePlayerStat.deleteMany({ where: { gameId: game.id } });
      if (d.playerStats === null) {
        statsClearedMvp = true;
      } else {
        validateStats(d.playerStats, match.teamAId, match.teamBId);
        for (const s of d.playerStats) {
          const inSnapshot = await tx.tournamentTeamPlayer.findFirst({
            where: { registrationId: s.registrationId, tournamentTeam: { tournamentId: match.tournamentId, teamId: s.teamId } },
          });
          if (!inSnapshot) throw new TournamentError('VALIDATION', '选手不在该队参赛名单快照');
          await tx.gamePlayerStat.create({ data: { gameId: game.id, ...s } });
        }
      }
    }

    // —— mvp 三态 + 规则（完整 stats 且 ∈10 人）——
    const mvpData: Record<string, unknown> = {};
    if (statsClearedMvp) {
      mvpData.mvpRegistrationId = null;
    } else if (d.mvpRegistrationId !== undefined) {
      if (d.mvpRegistrationId === null) {
        mvpData.mvpRegistrationId = null;
      } else {
        const statCount = await tx.gamePlayerStat.count({ where: { gameId: game.id } });
        if (statCount !== 10) throw new TournamentError('VALIDATION', 'MVP 需该局双方数据完整（各 5 人）');
        const isPlayer = await tx.gamePlayerStat.findFirst({ where: { gameId: game.id, registrationId: d.mvpRegistrationId } });
        if (!isPlayer) throw new TournamentError('VALIDATION', 'MVP 必须是该局 10 人之一');
        mvpData.mvpRegistrationId = d.mvpRegistrationId;
      }
    }

    // —— 落库 game 标量 ——
    await tx.game.update({
      where: { id: game.id },
      data: { winnerTeamId: nextWinner, isDraft: nextIsDraft, ...scalarData, ...mvpData },
    });

    // —— 重算系列赛结果 + 决赛 FINISHED hook（Task 2）——
    await resettleMatch(tx, match.id);

    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.detail',
      entity: 'Game', entityId: game.id,
      payload: { matchId: match.id, gameIndex: game.index, isDraft: nextIsDraft },
    });
    return { gameId: game.id };
  });
}

function validateBans(bans: BanInput[], sides: string[]): void {
  const orders = bans.map((b) => b.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++)
    if (orders[i] !== i + 1) throw new TournamentError('VALIDATION', 'BP 顺序须从 1 连续递增');
  const champ = new Set<string>();
  for (const b of bans) {
    if (!sides.includes(b.teamId)) throw new TournamentError('VALIDATION', 'BP 队伍必须是比赛双方之一');
    if (b.type !== 'BAN' && b.type !== 'PICK') throw new TournamentError('VALIDATION', 'BP 类型非法');
    if (!isChampionKey(b.championId)) throw new TournamentError('VALIDATION', `英雄不存在：${b.championId}`);
    if (champ.has(b.championId)) throw new TournamentError('VALIDATION', '同局英雄不可重复');
    champ.add(b.championId);
  }
}

function validateStats(stats: StatInput[], teamAId: string, teamBId: string): void {
  const aCount = stats.filter((s) => s.teamId === teamAId).length;
  const bCount = stats.filter((s) => s.teamId === teamBId).length;
  if (stats.length !== 10 || aCount !== 5 || bCount !== 5)
    throw new TournamentError('VALIDATION', '选手数据须双方各 5 条');
  const regs = new Set<string>();
  for (const s of stats) {
    if (s.teamId !== teamAId && s.teamId !== teamBId)
      throw new TournamentError('VALIDATION', '选手队伍必须是比赛双方之一');
    if (regs.has(s.registrationId)) throw new TournamentError('VALIDATION', '同局选手不可重复');
    regs.add(s.registrationId);
    if (!isChampionKey(s.championId)) throw new TournamentError('VALIDATION', `英雄不存在：${s.championId}`);
    for (const v of [s.kills, s.deaths, s.assists, s.cs, s.damage, s.gold])
      if (!Number.isInteger(v) || v < 0) throw new TournamentError('VALIDATION', '数据须为非负整数');
  }
}
```

> **设计说明**：CAS 在 `claimMatch` 内做（version+1）；`resettleMatch` 末尾的 `syncFinalStatus`（Task 2）负责决赛 FINISHED/回退。下游保护仅在「match 已 FINISHED」或「本次改变 winner（含新增转正局）」时触发——草稿建局/纯补 BP 不触发，符合 spec「快录补全不影响结算/不误伤下游」。

- [ ] **Step 6: Run 确认 PASS** — `npx vitest run src/lib/tournament/game-detail-service.test.ts --project unit`
  Expected: PASS（全部用例）。

- [ ] **Step 7: 全量回归** — `npx vitest run`
  Expected: 全 PASS（确认 test-helpers 抽取与 fixtures 改动不破坏既有套件）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/tournament/game-detail-service.ts src/lib/tournament/game-detail-service.test.ts \
  src/lib/tournament/score-service.test-helpers.ts src/lib/tournament/score-service.test.ts \
  src/lib/tournament/test-fixtures.ts
git commit -m "feat(tournament): saveGameDetail — draft/promote, tri-state bans/stats/scalars, completeness + downstream guards"
```

---

### Task 4: leaderboard 纯函数（TDD）

spec §6。纯函数 `computeLeaderboard(games)`：输入非草稿且 stats 完整的局，输出每 registration 一行（含 `playerId`）。表演赛（`countsForStandings=false`）计入；草稿/不完整局排除。

**Files:**
- Create: `src/lib/tournament/leaderboard.ts`
- Create: `src/lib/tournament/leaderboard.test.ts`

- [ ] **Step 1: 写失败测试** — `src/lib/tournament/leaderboard.test.ts`：

```ts
import { expect, it } from 'vitest';
import { computeLeaderboard, type LeaderboardGame, type LeaderboardStat } from './leaderboard';

function stat(registrationId: string, playerId: string, over: Partial<LeaderboardStat> = {}): LeaderboardStat {
  return { registrationId, playerId, teamId: 'TA', championId: 'Ahri', kills: 2, deaths: 1, assists: 4, cs: 200, damage: 20000, gold: 12000, ...over };
}
function game(over: Partial<LeaderboardGame> = {}): LeaderboardGame {
  return {
    isDraft: false, winnerTeamId: 'TA', mvpRegistrationId: null,
    playerStats: Array.from({ length: 10 }, (_, i) => stat(`r${i}`, `p${i}`, { teamId: i < 5 ? 'TA' : 'TB' })),
    ...over,
  };
}

it('空输入 → 空榜', () => {
  expect(computeLeaderboard([])).toEqual([]);
});

it('单局聚合：每人一行、场均 1 位小数、kda 2 位', () => {
  const rows = computeLeaderboard([game()]);
  expect(rows).toHaveLength(10);
  const r0 = rows.find((r) => r.registrationId === 'r0')!;
  expect(r0.playerId).toBe('p0');
  expect(r0.games).toBe(1);
  expect(r0.avgKills).toBe(2);
  expect(r0.kda).toBe(6); // (2+4)/max(1,1)
});

it('草稿局与不完整局被排除', () => {
  const draft = game({ isDraft: true });
  const incomplete = game({ playerStats: game().playerStats.slice(0, 9) });
  expect(computeLeaderboard([draft, incomplete])).toEqual([]);
});

it('wins 与 mvpCount 计数', () => {
  const g1 = game({ winnerTeamId: 'TA', mvpRegistrationId: 'r0' });
  const g2 = game({ winnerTeamId: 'TB', mvpRegistrationId: 'r0' });
  const r0 = computeLeaderboard([g1, g2]).find((r) => r.registrationId === 'r0')!;
  expect(r0.games).toBe(2);
  expect(r0.wins).toBe(1);
  expect(r0.mvpCount).toBe(2);
});

it('kda 防除零：deaths=0 用 max(1,D)', () => {
  const g = game({ playerStats: [stat('r0', 'p0', { teamId: 'TA', kills: 3, deaths: 0, assists: 1 }), ...game().playerStats.slice(1)] });
  const r0 = computeLeaderboard([g]).find((r) => r.registrationId === 'r0')!;
  expect(r0.kda).toBe(4);
});

it('场均四舍五入到 1 位小数', () => {
  const mk = (k: number) => game({ playerStats: [stat('r0', 'p0', { teamId: 'TA', kills: k }), ...game().playerStats.slice(1)] });
  const r0 = computeLeaderboard([mk(1), mk(2), mk(2)]).find((r) => r.registrationId === 'r0')!;
  expect(r0.avgKills).toBe(1.7); // 5/3
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/leaderboard.test.ts --project unit`
  Expected: FAIL（`computeLeaderboard` 未导出）。

- [ ] **Step 3: 实现** — `src/lib/tournament/leaderboard.ts`：

```ts
export type LeaderboardStat = {
  registrationId: string; playerId: string; teamId: string; championId: string;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
};
export type LeaderboardGame = {
  isDraft: boolean;
  winnerTeamId: string | null;
  mvpRegistrationId: string | null;
  playerStats: LeaderboardStat[];
};
export type LeaderboardRow = {
  registrationId: string; playerId: string;
  games: number; wins: number;
  avgKills: number; avgDeaths: number; avgAssists: number; kda: number;
  avgCs: number; avgDamage: number; avgGold: number; mvpCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 仅计入：非草稿 + stats 恰好 10 条（双方各 5 = 完整）。表演赛照计；草稿/不完整排除。 */
export function computeLeaderboard(games: LeaderboardGame[]): LeaderboardRow[] {
  type Acc = { playerId: string; g: number; w: number; k: number; d: number; a: number; cs: number; dmg: number; gold: number; mvp: number };
  const acc = new Map<string, Acc>();
  for (const game of games) {
    if (game.isDraft) continue;
    if (game.playerStats.length !== 10) continue;
    for (const s of game.playerStats) {
      const cur = acc.get(s.registrationId) ?? { playerId: s.playerId, g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, mvp: 0 };
      cur.g++;
      if (game.winnerTeamId && s.teamId === game.winnerTeamId) cur.w++;
      cur.k += s.kills; cur.d += s.deaths; cur.a += s.assists;
      cur.cs += s.cs; cur.dmg += s.damage; cur.gold += s.gold;
      if (game.mvpRegistrationId === s.registrationId) cur.mvp++;
      acc.set(s.registrationId, cur);
    }
  }
  return [...acc.entries()].map(([registrationId, v]) => ({
    registrationId, playerId: v.playerId, games: v.g, wins: v.w,
    avgKills: round1(v.k / v.g), avgDeaths: round1(v.d / v.g), avgAssists: round1(v.a / v.g),
    kda: round2((v.k + v.a) / Math.max(1, v.d)),
    avgCs: round1(v.cs / v.g), avgDamage: round1(v.dmg / v.g), avgGold: round1(v.gold / v.g),
    mvpCount: v.mvp,
  }));
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/leaderboard.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/leaderboard.ts src/lib/tournament/leaderboard.test.ts
git commit -m "feat(tournament): computeLeaderboard pure function (per-registration aggregates)"
```

---

### Task 5: player stats service（TDD）

spec §7。`getPlayerSeasonStats(db, playerId, seasonId)`：该选手在指定赛季的汇总（同 leaderboard 口径）+ 逐场明细（matchLabel/对手/英雄/K/D/A/胜负/是否 MVP）。两季隔离测试。

**Files:**
- Create: `src/lib/tournament/player-stats-service.ts`
- Create: `src/lib/tournament/player-stats-service.test.ts`

- [ ] **Step 1: 写失败测试** — `src/lib/tournament/player-stats-service.test.ts`：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { saveGameDetail } from './game-detail-service';
import { getPlayerSeasonStats } from './player-stats-service';
import { getChampions } from './champions';
import { expandRosterTo5 } from './test-fixtures';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

async function finalWithRosters() {
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

const stats = (teamId: string, regs: string[], off: number) =>
  regs.map((registrationId, k) => ({ teamId, registrationId, championId: C[(k + off) % C.length], kills: 3, deaths: 1, assists: 2, cs: 180, damage: 15000, gold: 11000 }));

it('汇总 + 逐场明细；MVP 标记', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: final.teamAId, playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)], mvpRegistrationId: a[0] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerSeasonStats(testDb, reg.playerId, t.seasonId))!;
  expect(res.summary.games).toBe(1);
  expect(res.summary.mvpCount).toBe(1);
  expect(res.games).toHaveLength(1);
  expect(res.games[0].isMvp).toBe(true);
  expect(res.games[0].kills).toBe(3);
  expect(typeof res.games[0].matchLabel).toBe('string');
  expect(res.games[0].opponent).toBeTruthy();
  expect(res.games[0].championId).toBeTruthy();
});

it('两季隔离：仅取指定赛季的数据', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: final.teamAId, playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const other = await testDb.season.create({ data: { name: 'S2', status: 'COMPLETED', teamBudget: 1000 } });
  const res = await getPlayerSeasonStats(testDb, reg.playerId, other.id);
  expect(res?.summary.games ?? 0).toBe(0);
});
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/player-stats-service.test.ts --project unit`
  Expected: FAIL（`getPlayerSeasonStats` 未导出）。

- [ ] **Step 3: 实现** — `src/lib/tournament/player-stats-service.ts`：

```ts
import type { Db } from './types';
import { championName } from './champions';

export type PlayerGameRow = {
  gameId: string; matchId: string; matchLabel: string; opponent: string;
  championId: string; championName: string | null;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
  win: boolean; isMvp: boolean;
};
export type PlayerSeasonStats = {
  playerId: string; nickname: string;
  summary: { games: number; wins: number; avgKills: number; avgDeaths: number; avgAssists: number; kda: number; avgCs: number; avgDamage: number; avgGold: number; mvpCount: number };
  games: PlayerGameRow[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 指定赛季内该选手的统计；签名按 seasonId 参数化（跨赛季汇总为后续扩展，零表改动）。 */
export async function getPlayerSeasonStats(db: Db, playerId: string, seasonId: string): Promise<PlayerSeasonStats | null> {
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) return null;
  const reg = await db.registration.findFirst({ where: { playerId, seasonId } }); // @@unique([seasonId, playerId])
  const empty: PlayerSeasonStats = {
    playerId, nickname: player.nickname,
    summary: { games: 0, wins: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0, kda: 0, avgCs: 0, avgDamage: 0, avgGold: 0, mvpCount: 0 },
    games: [],
  };
  if (!reg) return empty;

  const stats = await db.gamePlayerStat.findMany({
    where: { registrationId: reg.id, game: { isDraft: false, match: { tournament: { seasonId } } } },
    include: {
      game: { include: { match: { include: { teamA: { select: { id: true, name: true } }, teamB: { select: { id: true, name: true } } } } } },
    },
    orderBy: { game: { match: { scheduledAt: 'asc' } } },
  });

  const rows: PlayerGameRow[] = stats.map((s) => {
    const m = s.game.match;
    const opp = m.teamA?.id === s.teamId ? m.teamB : m.teamA;
    return {
      gameId: s.gameId, matchId: m.id, matchLabel: m.label ?? m.roundKey ?? '比赛',
      opponent: opp?.name ?? '—',
      championId: s.championId, championName: championName(s.championId),
      kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
      win: s.game.winnerTeamId === s.teamId,
      isMvp: s.game.mvpRegistrationId === reg.id,
    };
  });

  const n = rows.length;
  if (n === 0) return { playerId, nickname: reg.nickname, summary: empty.summary, games: [] };
  const sum = rows.reduce(
    (acc, r) => ({ k: acc.k + r.kills, d: acc.d + r.deaths, a: acc.a + r.assists, cs: acc.cs + r.cs, dmg: acc.dmg + r.damage, gold: acc.gold + r.gold, w: acc.w + (r.win ? 1 : 0), mvp: acc.mvp + (r.isMvp ? 1 : 0) }),
    { k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, w: 0, mvp: 0 },
  );
  return {
    playerId, nickname: reg.nickname,
    summary: {
      games: n, wins: sum.w,
      avgKills: round1(sum.k / n), avgDeaths: round1(sum.d / n), avgAssists: round1(sum.a / n),
      kda: round2((sum.k + sum.a) / Math.max(1, sum.d)),
      avgCs: round1(sum.cs / n), avgDamage: round1(sum.dmg / n), avgGold: round1(sum.gold / n),
      mvpCount: sum.mvp,
    },
    games: rows,
  };
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/player-stats-service.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/player-stats-service.ts src/lib/tournament/player-stats-service.test.ts
git commit -m "feat(tournament): getPlayerSeasonStats — season-scoped aggregate + per-game rows"
```

---

### Task 6: read-model 收窄 + admin/detail 读模型（TDD）

spec §5。公开 state 去 `version`/`config`/`tournament.config`、草稿局不泄露；新 `getAdminTournamentState`（公开形状 + version + config + games 摘要 isDraft/hasBans/hasStats）；新 `getPublicMatchDetail`（非草稿局完整明细，player 对象带 `playerId`，非活跃赛季返回 null）。

**Files:**
- Modify: `src/lib/tournament/read-model.ts`
- Create: `src/lib/tournament/read-model.test.ts`

- [ ] **Step 1: 写失败测试** — `src/lib/tournament/read-model.test.ts`：

```ts
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
```

- [ ] **Step 2: Run 确认 FAIL** — `npx vitest run src/lib/tournament/read-model.test.ts --project unit`
  Expected: FAIL（导出缺失 + 公开 state 仍含 config/version）。

- [ ] **Step 3: 实现** — 改写 `read-model.ts`。顶部补 import：

```ts
import { getActiveSeason } from '@/lib/season/season-service';
import { championName } from './champions';
import { computeStandings } from './standings';
import { buildBracket } from './bracket';
import type { Db } from './types';
```

(a) `getPublicTournamentState`：`tournament` 去 `config`；`matches.map` 去 `version`（其余不变）：

```ts
return {
  tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status }, // 去 config
  matches: t.matches.map((m) => ({
    id: m.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
    status: m.status, isWalkover: m.isWalkover,
    teamA: m.teamA, teamB: m.teamB, winnerTeamId: m.winnerTeamId,
    groupId: m.groupId, // 去 version
  })),
  standings, bracket,
};
```

> 公开 state 不返回 Game，故「草稿不泄露」天然满足；`getPublicMatchDetail` 才需显式过滤草稿。

(b) 新 `getAdminTournamentState(db, seasonId)`（复用查询 + 额外 include games 计数，保留 config/version）：

```ts
export async function getAdminTournamentState(db: Db, seasonId: string) {
  const t = await db.tournament.findUnique({
    where: { seasonId },
    include: {
      stages: { orderBy: { order: 'asc' }, include: { groups: { orderBy: { name: 'asc' }, include: { teams: { include: { team: { select: { id: true, name: true } } } } } } } },
      matches: {
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          games: { orderBy: { index: 'asc' }, include: { _count: { select: { bans: true, playerStats: true } } } },
        },
      },
    },
  });
  if (!t) return null;
  const groupStage = t.stages.find((s) => s.type === 'GROUP');
  const standings = (groupStage?.groups ?? []).map((g) => ({
    groupId: g.id, name: g.name,
    teams: Object.fromEntries(g.teams.map((x) => [x.team.id, x.team.name])),
    rows: computeStandings(g.teams.map((x) => x.team.id), t.matches.filter((m) => m.groupId === g.id).map((m) => ({ teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId, status: m.status, countsForStandings: m.countsForStandings }))),
  }));
  const bracket = buildBracket(t.matches.filter((m) => m.roundKey !== null).map((m) => ({ id: m.id, roundKey: m.roundKey, label: m.label, teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId, status: m.status })));
  return {
    tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status, config: t.config },
    matches: t.matches.map((m) => ({
      id: m.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status, isWalkover: m.isWalkover,
      teamA: m.teamA, teamB: m.teamB, winnerTeamId: m.winnerTeamId,
      groupId: m.groupId, version: m.version,
      games: m.games.map((g) => ({ id: g.id, index: g.index, isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, hasBans: g._count.bans > 0, hasStats: g._count.playerStats === 10 })),
    })),
    standings, bracket,
  };
}
```

(c) 新 `getPublicMatchDetail(db, matchId)`：

```ts
export async function getPublicMatchDetail(db: Db, matchId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      tournament: { select: { seasonId: true } },
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      games: {
        where: { isDraft: false }, orderBy: { index: 'asc' },
        include: {
          bans: { orderBy: { order: 'asc' } },
          playerStats: { include: { registration: { select: { id: true, nickname: true, playerId: true } } } },
        },
      },
    },
  });
  if (!match) return null;
  const active = await getActiveSeason(db);
  if (!active || match.tournament.seasonId !== active.id) return null;

  return {
    id: match.id, label: match.label, roundKey: match.roundKey, bestOf: match.bestOf,
    status: match.status, scheduledAt: match.scheduledAt?.toISOString() ?? null,
    teamA: match.teamA, teamB: match.teamB, winnerTeamId: match.winnerTeamId,
    games: match.games.map((g) => ({
      id: g.id, index: g.index, blueTeamId: g.blueTeamId, winnerTeamId: g.winnerTeamId,
      durationSeconds: g.durationSeconds, mvpRegistrationId: g.mvpRegistrationId,
      bans: g.bans.map((b) => ({ teamId: b.teamId, type: b.type, championId: b.championId, championName: championName(b.championId), order: b.order })),
      players: g.playerStats.map((s) => ({
        registrationId: s.registrationId, playerId: s.registration.playerId, nickname: s.registration.nickname,
        teamId: s.teamId, championId: s.championId, championName: championName(s.championId),
        kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
      })),
    })),
  };
}
```

- [ ] **Step 4: Run 确认 PASS** — `npx vitest run src/lib/tournament/read-model.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 5: vitest 全绿（typecheck 暂缓到 Task 8）** — `npx vitest run`
  Expected: vitest 全绿。**本 Task 不要求 `tsc` 全绿**：公开 state 收窄会让仍读 config/version 的 UI 报错，Task 8 hooks 迁移后整体收口。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/read-model.ts src/lib/tournament/read-model.test.ts
git commit -m "feat(tournament): narrow public state (drop version/config), add admin state + public match detail"
```

---

### Task 7: 路由（admin/state、matches/[id] enrich、games PUT、public match/leaderboard/player）

spec §5/§6/§7。新增管理端 state 路由；enrich `matches/[id]` GET（games 摘要 + rosters）；新 games PUT（**Zod 三态**）；新公开 match/leaderboard/player 路由。写操作后 `publishTournament`。

**Files:**
- Create: `src/app/api/tournament/admin/state/route.ts`
- Modify: `src/app/api/tournament/admin/matches/[id]/route.ts`（GET 加 games 摘要 + rosters）
- Create: `src/app/api/tournament/admin/matches/[id]/games/route.ts`
- Create: `src/app/api/tournament/public/match/[id]/route.ts`
- Create: `src/app/api/tournament/public/leaderboard/route.ts`
- Create: `src/app/api/tournament/public/player/[playerId]/route.ts`

- [ ] **Step 1: admin/state 路由** — `src/app/api/tournament/admin/state/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getAdminTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const seasonId = req.nextUrl.searchParams.get('seasonId') ?? (await getActiveSeason(prisma))?.id ?? null;
  if (!seasonId) return NextResponse.json({ state: null });
  const state = await getAdminTournamentState(prisma, seasonId);
  return NextResponse.json({ state });
}
```

- [ ] **Step 2: enrich matches/[id] GET** — 改现有 GET：移除 `where: { isDraft: false }`（详细录入需看草稿局），include games 计数 + 追加 rosters。返回 `{ match: shaped }`，`match.games` 带 `isDraft/hasBans/hasStats`，`match.rosters` 为双方快照：

```ts
const match = await prisma.match.findUnique({
  where: { id },
  include: {
    games: { orderBy: { index: 'asc' }, include: { _count: { select: { bans: true, playerStats: true } } } },
  },
});
if (!match) return NextResponse.json({ error: '比赛不存在' }, { status: 404 });
const tt = await prisma.tournamentTeam.findMany({
  where: { tournamentId: match.tournamentId, teamId: { in: [match.teamAId, match.teamBId].filter(Boolean) as string[] } },
  include: { players: { include: { registration: { select: { id: true, nickname: true } } } } },
});
const shaped = {
  id: match.id, version: match.version, bestOf: match.bestOf, status: match.status,
  teamAId: match.teamAId, teamBId: match.teamBId, winnerTeamId: match.winnerTeamId,
  games: match.games.map((g) => ({ id: g.id, index: g.index, isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, hasBans: g._count.bans > 0, hasStats: g._count.playerStats === 10 })),
  rosters: tt.map((x) => ({ teamId: x.teamId, players: x.players.map((p) => ({ registrationId: p.registrationId, nickname: p.registration.nickname })) })),
};
return NextResponse.json({ match: shaped });
```

> ScoreDialog（Task 10）消费 `match.games` 摘要 + `match.rosters`；GameDetailEditor（Task 9）消费 rosters。

- [ ] **Step 3: games PUT 路由（三态 Zod——crux）** — `src/app/api/tournament/admin/matches/[id]/games/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { saveGameDetail } from '@/lib/tournament/game-detail-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const banSchema = z.object({
  teamId: z.string().min(1), type: z.enum(['BAN', 'PICK']),
  championId: z.string().min(1), order: z.number().int().positive(),
});
const statSchema = z.object({
  teamId: z.string().min(1), registrationId: z.string().min(1), championId: z.string().min(1),
  kills: z.number().int().nonnegative(), deaths: z.number().int().nonnegative(), assists: z.number().int().nonnegative(),
  cs: z.number().int().nonnegative(), damage: z.number().int().nonnegative(), gold: z.number().int().nonnegative(),
});

// 三态 crux：.nullish() = undefined | null | value。
// 省略 key → undefined（保留）；显式 null → 清空；array/value → 设置。
// 绝不能用 .default() —— 会把 undefined 折叠成具体值，破坏「保留」语义。
const bodySchema = z.object({
  expectedVersion: z.number().int(),
  gameId: z.string().min(1).optional(),
  detail: z.object({
    winnerTeamId: z.string().min(1).nullish(),
    blueTeamId: z.string().min(1).nullish(),
    durationSeconds: z.number().int().nullish(),
    mvpRegistrationId: z.string().min(1).nullish(),
    bans: z.array(banSchema).nullish(),
    playerStats: z.array(statSchema).nullish(),
  }),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = bodySchema.parse(await req.json());
    const res = await saveGameDetail(prisma, {
      matchId: id, gameId: body.gameId, expectedVersion: body.expectedVersion,
      detail: body.detail, actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true, gameId: res.gameId });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
```

> **Zod 三态关键**：`.nullish()` 推断 `T | null | undefined`。对 `z.object` 的 key：请求体**省略该 key** → parse 结果 key 为 `undefined`（不存在）；**显式 `null`** → `null`。两者在 `saveGameDetail` 内分别命中「保留」「清空」。**前端必须 omit 未触碰的块（不发 key），发 `null` 表示清空，发 array/value 表示设置**——见 Task 9。

- [ ] **Step 4: public match 路由** — `src/app/api/tournament/public/match/[id]/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getPublicMatchDetail } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPublicMatchDetail(prisma, id);
  if (!detail) return NextResponse.json({ error: '比赛不存在' }, { status: 404 });
  return NextResponse.json({ detail });
}
```

- [ ] **Step 5: public leaderboard 路由** — `src/app/api/tournament/public/leaderboard/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { computeLeaderboard, type LeaderboardGame } from '@/lib/tournament/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ rows: [] });
  const games = await prisma.game.findMany({
    where: { isDraft: false, match: { tournament: { seasonId: season.id } } },
    include: { playerStats: { include: { registration: { select: { id: true, nickname: true, playerId: true } } } } },
  });
  const input: LeaderboardGame[] = games.map((g) => ({
    isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, mvpRegistrationId: g.mvpRegistrationId,
    playerStats: g.playerStats.map((s) => ({
      registrationId: s.registrationId, playerId: s.registration.playerId, teamId: s.teamId, championId: s.championId,
      kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
    })),
  }));
  const rows = computeLeaderboard(input);
  const nameByReg = new Map<string, string>();
  for (const g of games) for (const s of g.playerStats) nameByReg.set(s.registrationId, s.registration.nickname);
  return NextResponse.json({ rows: rows.map((r) => ({ ...r, nickname: nameByReg.get(r.registrationId) ?? '—' })) });
}
```

- [ ] **Step 6: public player 路由** — `src/app/api/tournament/public/player/[playerId]/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getPlayerSeasonStats } from '@/lib/tournament/player-stats-service';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '无活跃赛季' }, { status: 404 });
  const stats = await getPlayerSeasonStats(prisma, playerId, season.id);
  if (!stats) return NextResponse.json({ error: '选手不存在' }, { status: 404 });
  return NextResponse.json({ stats });
}
```

- [ ] **Step 7: middleware 确认** — `src/middleware.ts` 已含 `/tournament` 与 `/api/tournament/public` 前缀（探查确认），新公开路由 `/api/tournament/public/{match,leaderboard,player}` 与页面 `/tournament/{match,player}/...` 自动覆盖。无需改 middleware。

- [ ] **Step 8: typecheck + lint + 全量套件** — `npm run typecheck && npm run lint && npx vitest run`
  Expected: service/路由层绿；vitest 全绿。**typecheck 允许暂红**（仅限 UI 仍读旧公开 state config/version 的文件——Task 8 收口）。记录红点。

- [ ] **Step 9: Commit**

```bash
git add src/app/api/tournament
git commit -m "feat(tournament): admin/state + matches GET enrich + games PUT (tri-state) + public match/leaderboard/player routes"
```

---

### Task 8: hooks 迁移（useAdminTournamentState + 收窄 useTournamentState）

spec §5。管理端读模型 hook 打 admin 端点（带 config/version/games 摘要）；公开 hook 类型收窄。迁移 4 个管理端组件读 admin hook。typecheck 是安全网。

**Files:**
- Modify: `src/hooks/useTournamentState.ts`（收窄 PublicState；新增 useAdminTournamentState + AdminState 类型）
- Modify: `src/components/admin/tournament/TournamentAdmin.tsx`
- Modify: `src/components/admin/tournament/SetupTab.tsx`
- Modify: `src/components/admin/tournament/GroupsTab.tsx`
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`

- [ ] **Step 1: 收窄 PublicState + 新增 AdminState/hook** — `useTournamentState.ts`：
  - `PublicState.tournament` 去 `config`；`matches[]` 去 `version`。
  - 新增类型与 hook：

  ```ts
  export type AdminGameSummary = { id: string; index: number; isDraft: boolean; winnerTeamId: string | null; hasBans: boolean; hasStats: boolean };
  export type AdminMatch = NonNullable<PublicState>['matches'][number] & { version: number; games: AdminGameSummary[] };
  export type AdminState = (Omit<NonNullable<PublicState>, 'tournament' | 'matches'> & {
    tournament: { id: string; name: string; kind: string; status: string; config: GroupKnockoutConfig };
    matches: AdminMatch[];
  }) | null;

  export function useAdminTournamentState(seasonId: string): { state: AdminState; loaded: boolean; refetch: () => Promise<void> } {
    // 镜像 useTournamentState：初次 + SSE 'tournament.invalidated' 时
    // fetch('/api/tournament/admin/state?seasonId=' + seasonId)；EventSource 仍用公开 stream（同一失效信号）。
  }
  ```

  > 实现完全镜像现有 `useTournamentState`（保留 `EventSource('/api/tournament/public/stream')` + `addEventListener('tournament', …)` + `tournament.invalidated → refetch` 模式），只把 fetch URL 换成 admin 端点（带 seasonId query），`useEffect` 依赖加 `seasonId`。

- [ ] **Step 2: TournamentAdmin 改用 admin hook** — `const { state, loaded, refetch } = useTournamentState();` → `useAdminTournamentState(seasonId)`（`seasonId` 已是 prop）。传给三个 Tab 的 `state` 现为 `AdminState`（含 config/version/games）。`state.tournament.{name,kind,status}` 读取不变。

- [ ] **Step 3: 各 Tab 类型切换** — SetupTab/GroupsTab/ScheduleTab 的 `Props.state` 从 `PublicState` 改 `AdminState`：
  - **GroupsTab**（line ~43）：`state.tournament.config` 现来自 AdminState（类型已是 `GroupKnockoutConfig`）——`as GroupKnockoutConfig` cast 可去可留。
  - **SetupTab**：`tournamentToConfigValue(t)` 读 `t.config`——AdminState 提供。
  - **ScheduleTab**：`MatchRow = NonNullable<AdminState>['matches'][number]`；`match.version`（line ~383/413/437）来自 `AdminMatch.version`——OK。传给 ScoreDialog 的 `MatchRef`（含 version）类型兼容。

- [ ] **Step 4: 公开组件保持收窄 hook** — `PublicTournamentView` 仍用 `useTournamentState`（探查确认只读 matches/standings/bracket，不读 config/version）；`ScheduleList` 的 `Match = NonNullable<PublicState>['matches'][number]`（无 version，探查确认不读 version）。收窄不影响。

- [ ] **Step 5: typecheck（安全网）** — `npm run typecheck`
  Expected: 绿。报「config/version 不存在于 PublicState」处定位到仍读旧形状的组件，改读 admin hook 或移除该读取，逐一消解。

- [ ] **Step 6: lint + 全量套件** — `npm run lint && npx vitest run`
  Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTournamentState.ts src/components/admin/tournament/TournamentAdmin.tsx \
  src/components/admin/tournament/SetupTab.tsx src/components/admin/tournament/GroupsTab.tsx \
  src/components/admin/tournament/ScheduleTab.tsx
git commit -m "feat(tournament): useAdminTournamentState (config/version/games) + narrowed public hook"
```

---

### Task 9: UI — ChampionSelect + GameDetailEditor

spec §8。`ChampionSelect`（house ui 无 command.tsx → 用 Input 过滤 + 下拉列表 + 头像 fallback）；`GameDetailEditor` Dialog（蓝方/时长/BP/双方 5×6/MVP），客户端镜像完整性规则，保存调 games PUT，三态 payload，409 toast+refetch+保持打开。

**Files:**
- Create: `src/components/admin/tournament/ChampionSelect.tsx`
- Create: `src/components/admin/tournament/GameDetailEditor.tsx`

- [ ] **Step 1: ChampionSelect** — 实现要点（复用 `Input`/`Button`/`Badge`；无 Command 组件）：
  - **Props**：`{ value: string | null; onChange: (key: string | null) => void; placeholder?: string }`。
  - **数据源**：`getChampions()`（`@/lib/tournament/champions`，客户端可直接用，JSON 支撑的纯函数）。
  - **交互**：触发按钮显示当前英雄（头像 `championIconUrl(value)` + `championName(value)`，img `onError` 隐藏图改显文字）；点击展开相对定位浮层，顶部 `Input` 搜索（按中文名或 key 不区分大小写过滤），下方滚动列表（`max-h-64 overflow-auto`），每项头像+名+key，点击 `onChange(key)` 收起；支持清空（`onChange(null)`）。
  - **无障碍/可测**：触发按钮 `role="combobox"`，列表项 `role="option"`（E2E selector 与现有 Radix 风格一致）。
  - **契约**：`onChange` 只回传 championId（key）；父组件组装到 bans/stats。

- [ ] **Step 2: GameDetailEditor** — Dialog，per spec §8。实现要点：
  - **Props**：
    ```ts
    type Props = {
      open: boolean;
      onClose: () => void;
      match: { id: string; version: number; teamA: { id: string; name: string }; teamB: { id: string; name: string }; bestOf: number };
      gameId?: string;                 // 缺省=新建局；提供=编辑既有局
      initial?: GameDetailInitial | null; // 既有局回填
      rosters: { teamId: string; players: Array<{ registrationId: string; nickname: string }> }[]; // 双方快照（5 人/队）
      refetch: () => Promise<void>;
    };
    ```
  - **本地状态**：`blueTeamId: string | null`、`durationMin/durationSec`（分:秒→`durationSeconds`）、`winnerTeamId: string | null`、`bans: BanInput[]`、`stats: Record<teamId, StatRow[5]>`、`mvp: string | null`，外加每块 `touched` 标记（`bansTouched`/`statsTouched`/`blueTouched`/`durationTouched`/`mvpTouched`）。**未 touched → omit；touched 且清空 → null；touched 且有值 → value**——三态 editor 侧落点。
  - **BP 编辑器**：逐条「+ 添加 ban/pick」，每条选队/类型（BAN/PICK）/`ChampionSelect`；order 由列表位置自动 1..N；可整段清空（`bans=null`）。客户端校验：championId 唯一、order 连续（位置保证）。
  - **双方 5×6 stats 表格**：每队一表，5 行（registrationId 锁定为快照 5 人），列 `ChampionSelect` + K/D/A/CS/伤害/金币（数字 Input，非负整数）。
  - **MVP Select**：10 人（双方快照），仅当双方 stats 全填齐时可选，否则禁用提示。
  - **胜方**：单选 teamA/teamB 或「存草稿」（winnerTeamId=null）。**既有非草稿局编辑时隐藏「存草稿」**（已转正不可退草稿）。
  - **保存 → PUT** `/api/tournament/admin/matches/{match.id}/games`，body（三态 payload）：
    ```ts
    {
      expectedVersion: match.version,
      gameId,  // 编辑既有局时带
      detail: {
        ...((winnerTouched || !gameId) ? { winnerTeamId } : {}),
        ...(blueTouched ? { blueTeamId } : {}),
        ...(durationTouched ? { durationSeconds: durationVal } : {}),   // null 或 number
        ...(bansTouched ? { bans: bansEmpty ? null : bansArray } : {}),
        ...(statsTouched ? { playerStats: statsEmpty ? null : statsArray } : {}),
        ...(mvpTouched ? { mvpRegistrationId: mvp } : {}),
      },
    }
    ```
    **IMPORTANT**：未触碰的块**不出现在 detail**（omit → 后端 undefined → 保留）；清空发 `null`；编辑发 array/value。新建局始终带 `winnerTeamId`（可 null=草稿）。
  - **409 处理**（同 ScoreDialog 现有模式）：`res.status === 409` → `toast.error('该比赛已被修改，已刷新')` + `await refetch()` + **保持 Dialog 打开**；父组件 refetch 后把新 version 透传，editor 监听 `match.version` 变化重置 `expectedVersion`。其它非 ok → `toast.error(data.error ?? '保存失败')`。成功 → `toast.success` + `refetch()` + `onClose()`。
  - **完整性前端镜像**（后端为准）：BP order 连续（位置保证）、championId ∈ 静态表（ChampionSelect 只出合法项）、stats 双方各 5（表格固定 5 行）、MVP 需 stats 齐——禁用态 + 提交前再校验给 toast。

- [ ] **Step 3: typecheck + lint** — `npm run typecheck && npm run lint`
  Expected: 绿。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/tournament/ChampionSelect.tsx src/components/admin/tournament/GameDetailEditor.tsx
git commit -m "feat(tournament): ChampionSelect + GameDetailEditor (tri-state payload, 409 keep-open)"
```

---

### Task 10: UI — ScoreDialog 整合

spec §8。ScoreDialog 每局行加「详细」按钮 + 底部「+ 详细录入一局」（草稿可），打开 GameDetailEditor；从 matches/[id] GET 摘要显示每局完整性徽章（BP/数据/草稿）。

**Files:**
- Modify: `src/components/admin/tournament/ScoreDialog.tsx`

实现要点：
- [ ] **Step 1: 接 GameDetailEditor** — ScoreDialog 现 `fetchGames` 打 `GET /api/tournament/admin/matches/{id}`（Task 7 已让其返回含 `isDraft/hasBans/hasStats` 的 games + `rosters`）。把内部 `Game` 类型扩为 `{ id; index; isDraft; winnerTeamId; hasBans; hasStats }`，并保存 `rosters`。
  - 每局行右侧（原「删除」旁）加「详细」按钮 → 打开 `GameDetailEditor`（`gameId=该局`，`rosters` 透传；`initial` 由 editor 打开时自行 `GET /api/tournament/public/match/{id}` 取该局明细回填，找不到则空表）。
  - 底部「+ 详细录入一局」按钮 → 打开 `GameDetailEditor`（无 gameId，新建；允许存草稿）。
- [ ] **Step 2: 完整性徽章** — 每局行徽章：`isDraft` → `Badge variant="outline">草稿`；`hasBans` → `BP`；`hasStats` → `数据`。快录局（非草稿、hasBans=false、hasStats=false）只显胜方。
- [ ] **Step 3: 保持快录** — 原「点胜方即录一局」（POST matches/[id] → recordGame 快录路径）保留不动；详细录入为并行入口。
- [ ] **Step 4: 409 一致性** — 现有 ScoreDialog 409 模式（toast + refetch + fetchGames）保留；GameDetailEditor 自带 409 处理。
- [ ] **Step 5: typecheck + lint + 手动 smoke** — `npm run typecheck && npm run lint`；`npm run dev` 走：录比分 → 详细 → 填 BP+数据+MVP → 保存 → 徽章出现。
- [ ] **Step 6: Commit**

```bash
git add src/components/admin/tournament/ScoreDialog.tsx
git commit -m "feat(tournament): ScoreDialog detail entry + completeness badges"
```

---

### Task 11: UI — 公开比赛详情页

spec §8。`/tournament/match/[id]`：逐局 Tab、BP 时间线（头像）、10 人对比表、MVP 徽章、'仅记录胜负' 空态；ScheduleList 行链接进入。

**Files:**
- Create: `src/app/tournament/match/[id]/page.tsx`
- Create: `src/components/tournament/MatchDetailView.tsx`
- Modify: `src/components/tournament/ScheduleList.tsx`（行链接）

实现要点：
- [ ] **Step 1: page.tsx** — client：取 `params.id`，`GET /api/tournament/public/match/{id}`，渲染 `<MatchDetailView detail={...} />`；404/未活跃赛季 → 「比赛不存在或暂未公开」空态。SSE 可选（复用公开 stream invalidated 重拉；详情页低频，可省略）。
- [ ] **Step 2: MatchDetailView** — 头部对阵（teamA vs teamB + 比分=各队非草稿胜局数）；`Tabs` 逐局（第 1/2/3 局…）：
  - 蓝红色条：`blueTeamId` 决定哪队蓝方（蓝/红底色）。
  - BP 时间线：`bans` 按 order，头像（`championIconUrl(championId)`，`onError` fallback `championName`）+ BAN/PICK 标签 + 队色。
  - 10 人对比表（`Table`）：按队分列/分区；列 选手昵称（链接 `/tournament/player/{playerId}`）/英雄（头像+名）/K/D/A/CS/伤害/金币；MVP 行加 `Badge>MVP`。
  - 时长：`durationSeconds` → `mm:ss`。
  - 该局无 players（快录局非草稿、stats 空）→ 显示「仅记录胜负」空态。
  - 整场 `detail.games.length === 0`（全草稿/无局）→「暂无对局明细」。
- [ ] **Step 3: ScheduleList 行链接** — 每行包 Next `<Link href={\`/tournament/match/${match.id}\`}>`；保持现有行视觉；CANCELED 行可不链接。
- [ ] **Step 4: typecheck + lint + 手动验收** — `npm run typecheck && npm run lint`；`npm run dev` → /tournament 赛程行点击 → 详情页逐局/BP/数据/MVP 正确。
- [ ] **Step 5: Commit**

```bash
git add src/app/tournament/match src/components/tournament/MatchDetailView.tsx src/components/tournament/ScheduleList.tsx
git commit -m "feat(tournament): public match detail page (per-game BP timeline, 10-player table, MVP)"
```

---

### Task 12: UI — 数据榜 Tab + 选手页

spec §6/§7。公开 `/tournament` 加「数据榜」Tab（可排序，行链接选手页）；选手页 `/tournament/player/[playerId]`（汇总头 + 逐场表）。

**Files:**
- Create: `src/components/tournament/LeaderboardView.tsx`
- Modify: `src/components/tournament/PublicTournamentView.tsx`（加 Tab）
- Create: `src/app/tournament/player/[playerId]/page.tsx`
- Create: `src/components/tournament/PlayerStatsView.tsx`

实现要点：
- [ ] **Step 1: LeaderboardView** — `GET /api/tournament/public/leaderboard` → `{ rows }`（每行含 nickname/playerId/games/wins/avgKills…/kda/mvpCount）。`Table`，表头列可点击排序（本地 `sortKey`/`sortDir`，默认 kda 降序）。每行 `nickname` 链接 `/tournament/player/{playerId}`。空态「暂无数据」。SSE 可选（复用公开 stream invalidated 重拉）。
- [ ] **Step 2: PublicTournamentView 加 Tab** — 现有 `Tabs`（赛程/小组赛/对阵图）加第 4 个 `TabsTrigger value="leaderboard">数据榜` + `TabsContent><LeaderboardView /></TabsContent>`。
- [ ] **Step 3: PlayerStatsView** — props `{ stats: PlayerSeasonStats }`：汇总头（昵称 + 场次/胜/KDA/MVP 数 + 场均 K/D/A/CS/伤害/金币）；逐场 `Table`（matchLabel/对手/英雄头像+名/K/D/A/胜负/MVP 徽章）。
- [ ] **Step 4: player page.tsx** — client，取 `params.playerId`，`GET /api/tournament/public/player/{playerId}` → `{ stats }`，渲染 `<PlayerStatsView />`；404 → 「选手不存在」。
- [ ] **Step 5: typecheck + lint + 手动验收** — `npm run typecheck && npm run lint`；`npm run dev` → 数据榜排序 + 行点击进选手页。
- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/LeaderboardView.tsx src/components/tournament/PublicTournamentView.tsx \
  src/app/tournament/player src/components/tournament/PlayerStatsView.tsx
git commit -m "feat(tournament): public leaderboard tab + player season stats page"
```

---

### Task 13: 集成测试（M2 全流程，TDD）

spec §9。建赛季→分组→混合（快录 + 详细）→决赛→FINISHED→leaderboard/matchDetail/playerStats 断言。

**Files:**
- Create: `src/lib/tournament/integration-m2.test.ts`

> 不改既有 `integration.test.ts`（M1 流程仍有效）。新建 M2 专属集成文件。

- [ ] **Step 1: 写集成测试** — `src/lib/tournament/integration-m2.test.ts`：

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createSeason } from '@/lib/season/season-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { saveGameDetail } from './game-detail-service';
import { getPublicTournamentState, getPublicMatchDetail } from './read-model';
import { getPlayerSeasonStats } from './player-stats-service';
import { computeLeaderboard, type LeaderboardGame } from './leaderboard';
import { CFG_2x4x2, seedTeamsForSeason, expandRosterTo5 } from './test-fixtures';
import { getChampions } from './champions';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

it('M2 全流程：建赛季→分组→快录+详细→决赛 FINISHED→数据榜/详情/选手页', async () => {
  const season = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: { kind: '正赛', config: CFG_2x4x2 } }, 'u');
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  const teamIds = await seedTeamsForSeason(season.id, 8);
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
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
  const state = (await getPublicTournamentState(testDb, season.id))!;
  expect((state.tournament as Record<string, unknown>).config).toBeUndefined();

  // 比赛详情：FINAL 3 局完整明细
  const detail = (await getPublicMatchDetail(testDb, final.id))!;
  expect(detail.games).toHaveLength(3);
  expect(detail.games[0].players).toHaveLength(10);
  expect(detail.games[0].players[0].playerId).toBeTruthy();

  // 数据榜：a[0] 3 场 3 胜 3 MVP
  const games = await testDb.game.findMany({ where: { isDraft: false, match: { tournament: { seasonId: season.id } } }, include: { playerStats: { include: { registration: { select: { playerId: true } } } } } });
  const lb = computeLeaderboard(games.map((g): LeaderboardGame => ({ isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, mvpRegistrationId: g.mvpRegistrationId, playerStats: g.playerStats.map((s) => ({ registrationId: s.registrationId, playerId: s.registration.playerId, teamId: s.teamId, championId: s.championId, kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold })) })));
  const lbRow = lb.find((r) => r.registrationId === a[0])!;
  expect(lbRow.games).toBe(3);
  expect(lbRow.wins).toBe(3);
  expect(lbRow.mvpCount).toBe(3);

  // 选手页
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const ps = (await getPlayerSeasonStats(testDb, reg.playerId, season.id))!;
  expect(ps.summary.games).toBe(3);
  expect(ps.summary.mvpCount).toBe(3);
  expect(ps.games).toHaveLength(3);
  expect(ps.games.every((r) => r.isMvp)).toBe(true);
});
```

- [ ] **Step 2: Run 确认 PASS** — `npx vitest run src/lib/tournament/integration-m2.test.ts --project unit`
  Expected: PASS。

- [ ] **Step 3: 全量回归** — `npx vitest run`
  Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/lib/tournament/integration-m2.test.ts
git commit -m "test(tournament): M2 integration — mixed quick/detail entry → FINISHED → leaderboard/detail/player"
```

---

### Task 14: E2E 实跑 + 回归 + 构建

spec §9（**部署前必须实际执行**）。扩展 `scripts/e2e-tournament.spec.ts`：UI 详细录入一局（BP+stats+MVP）→ 公开详情页 + 数据榜断言。实跑 E2E，全量 vitest，typecheck+build。

**Files:**
- Modify: `scripts/e2e-tournament.spec.ts`

- [ ] **Step 1: 扩展 E2E spec**（prose）— 在现有 SF/KO 录分段或 FINAL 录完前，对其中一局走详细路径：
  - 打开 `GameDetailEditor`：`button:has-text("详细")` 或底部 `button:has-text("详细录入一局")`。
  - editor 内：选蓝方（`[role="dialog"] button[role="combobox"]` 系列）；填时长（分/秒 Input）；加 1 条 BP（点「+ ban」→ `ChampionSelect` 的 `[role="combobox"]` → 搜索框输入英雄名 → `[role="option"]` 首项）；填双方各 5 行数据（`[role="dialog"] table input` 用 `page.fill` 批量填数字，每行 `ChampionSelect` 选英雄）；选 MVP；选胜方；保存（`button:has-text("保存")`）。
  - **断言**：
    - 公开详情页：`nav('/tournament/match/{id}')`（或赛程行点击），断言出现 BP 头像/英雄名、10 人表（`table` 行数）、MVP 徽章（`text=MVP`）。
    - 数据榜 Tab：`/tournament` 点 `[role="tab"]:has-text("数据榜")`，断言表格非空、出现该选手昵称、kda 列有值。
  - 现有清理（reset）/创建/分组/录分段保持不变。
- [ ] **Step 2: 实跑 E2E（REQUIRED）** — 精确命令：
  ```bash
  # 1) 准备测试库 + 种子（8 队 COMPLETED 赛季）
  npm run db:reset
  node scripts/seed-e2e.mjs
  # 2) 起 dev server（后台），等待 http://localhost:3000 就绪
  npm run dev &
  # 3) 跑 E2E（Playwright spec）
  npx playwright test scripts/e2e-tournament.spec.ts
  ```
  > 若 `package.json` 无 `e2e` script，按 `scripts/e2e-tournament.spec.ts` 头部注释的运行方式执行。admin 登录 `admin` / `lol2026`（探查确认）。**本 Task 必须真正运行并通过**（上轮只改未跑——本轮强制执行，spec §9）。
  Expected: E2E 绿——含新的详细录入 + 详情页/数据榜断言。
- [ ] **Step 3: 全量回归** — `npx vitest run`
  Expected: exit 0，全绿。
- [ ] **Step 4: typecheck + lint + build** — `npm run typecheck && npm run lint && npm run build`
  Expected: exit 0。注意 lint error 会让 build 失败（装饰性 `//` 文本须转义为 `{'//'}` 等——沿用 M1 经验）。
- [ ] **Step 5: Commit**

```bash
git add scripts/e2e-tournament.spec.ts
git commit -m "test(tournament): e2e detail-record one game (BP+stats+MVP) + public detail/leaderboard assertions"
```

---

## Spec 覆盖表（§ → Task）

| Spec § | 要求 | Task |
|---|---|---|
| §1 录入双轨保留（快录 + 详细并存，快录可补全） | recordGame 不动 + saveGameDetail 并行 + ScoreDialog 双入口 | 3, 10 |
| §1 选手页缩水版（仅当前赛季，按 seasonId 参数化） | getPlayerSeasonStats(db, playerId, seasonId) | 5 |
| §1 技术债：公开接口收窄 version/config | read-model 收窄 + hook 拆分 | 6, 8 |
| §1 技术债：决赛完赛自动 FINISHED | score-service hook | 2 |
| §1 零 schema 变更 | 全计划遵守（无 prisma 改动） | — |
| §2 英雄静态表（脚本 + champions.json + champions.ts + ChampionSelect） | build-champions / champions.ts / ChampionSelect | 1, 9 |
| §3.1 GameDetailInput 数据形状（含 scalar 三态 codex 提醒） | game-detail-service types | 3 |
| §3.2 完整性契约（bans/stats/scalar 三态 + all-or-nothing + championId∈静态表 + mvp 规则） | saveGameDetail 校验 | 3 |
| §3.3 草稿与转正（事务序 claim→assertSeasonWritable→状态守卫→下游保护→写→resettle→audit；已转正不可退草稿；bestOf 上限） | saveGameDetail tx | 3 |
| §4 决赛自动 FINISHED（resettle/walkover/cancel 三径 + 回退 KNOCKOUT） | syncFinalStatus hook | 2 |
| §5 getPublicTournamentState 收窄（去 version/config，草稿不泄露） | read-model | 6 |
| §5 getAdminTournamentState（+ config/version + games 摘要） | read-model | 6 |
| §5 GET /admin/state?seasonId（默认活跃） + useAdminTournamentState | 路由 + hook | 7, 8 |
| §5 matches/[id] GET 加完整性摘要 + 草稿标记（+ rosters） | 路由 enrich | 7 |
| §5 getPublicMatchDetail（非草稿局完整明细 + playerId + 解析映射 + 非活跃 null） | read-model + 路由 | 6, 7 |
| §6 computeLeaderboard 纯函数（含 playerId / rounding / 排除规则 / 表演赛计入） | leaderboard.ts | 4 |
| §6 GET /public/leaderboard + 数据榜 Tab（可排序，行链接选手页） | 路由 + LeaderboardView | 7, 12 |
| §7 getPlayerSeasonStats（汇总 + 逐场明细 + 两季隔离） | player-stats-service | 5 |
| §7 GET /public/player/[playerId] + 选手页 | 路由 + PlayerStatsView | 7, 12 |
| §8 GameDetailEditor（蓝方/时长/BP/5×6/MVP，三态 payload，409 keep-open） | GameDetailEditor | 9 |
| §8 ScoreDialog 详细入口 + 完整性徽章 | ScoreDialog | 10 |
| §8 公开比赛详情页（逐局 Tab/BP 时间线/10 人表/MVP/空态） + ScheduleList 行链接 | match 详情页 | 11 |
| §8 数据榜 Tab + 选手页 | LeaderboardView / PlayerStatsView | 12 |
| §9 champions JSON 结构校验 | champions.test | 1 |
| §9 game-detail-service TDD 列表（草稿/转正/改判下游/BP/stats/MVP/补全/三态/CAS/归档/上限） | game-detail-service.test | 3 |
| §9 自动 FINISHED 三径矩阵 | score-service.test | 2 |
| §9 leaderboard 聚合/排除/表演赛计入 | leaderboard.test | 4 |
| §9 选手页 service 汇总+明细+跨赛季参数化 | player-stats-service.test | 5 |
| §9 read-model 回归断言（公开无 version/config / admin 含之 / 详情无草稿局） | read-model.test | 6 |
| §9 集成（建赛季→分组→混合录入→决赛→FINISHED→读模型断言） | integration-m2.test | 13 |
| §9 E2E 实跑（详细录入一局 → 详情页/数据榜断言；**必须实际执行**） | e2e spec + 实跑 | 14 |
| §10 范围外（审计页/跨赛季生涯/BP 模板/图标打包/导入导出） | 不实现 | — |

---

## 实施顺序与依赖说明

- **服务层链（必须先于 UI）**：Task 1（champions，被 3/6 强校验依赖）→ Task 2（score-service 导出 helpers + 自动 FINISHED，被 3 复用）→ Task 3（saveGameDetail，被 5/6/13 依赖；其 Step 1 抽 `score-service.test-helpers.ts`、Step 2 加 `expandRosterTo5`，被多个测试共用）→ Task 4（leaderboard）→ Task 5（player-stats）→ Task 6（read-model 收窄 + admin/detail）。Task 4/5 互不依赖，可并行。
- **路由层**：Task 7 依赖 3/4/5/6 全部 service 就绪。其 Step 2 的 matches/[id] GET enrich（含 games 摘要 + rosters）一次写全，Task 10 仅消费。
- **hooks 收口**：Task 8 必须在 Task 6（read-model 收窄）之后——公开 state 类型变更会让 UI 报错，Task 8 是 typecheck 收口点。**Task 6 Step 5 / Task 7 Step 8 允许 typecheck 暂红**（仅 UI 的 config/version 读取处），Task 8 完成后 typecheck 必须全绿。
- **UI 链**：Task 9（ChampionSelect/GameDetailEditor）→ Task 10（ScoreDialog 整合，依赖 9）→ Task 11（公开详情页，依赖 6/7 的 getPublicMatchDetail）→ Task 12（数据榜/选手页，依赖 7 路由）。9→10 强依赖；11/12 互不依赖可并行。
- **收尾**：Task 13（集成，依赖全部 service）→ Task 14（E2E 实跑，依赖全部 UI + 路由；**强制真实执行**）。
- **三态一致性贯穿**：`GameDetailInput`（Task 3 types）、Zod `.nullish()`（Task 7 games PUT）、`saveGameDetail` 分支（Task 3）、GameDetailEditor 的 touched→omit/null/value payload（Task 9）四处语义必须完全一致——任一处把 undefined 折叠成 null/value 即破坏「保留」语义，是本计划最易错点。
- **零 schema 变更**：全程不动 `prisma/schema.prisma`、不跑 migrate（Game/GameBanPick/GamePlayerStat 字段 M1 已建全）。
- **测试命令**：`npx vitest run <file> --project unit`（unit 项目在 vitest.workspace.ts）；全量回归 `npx vitest run`。
