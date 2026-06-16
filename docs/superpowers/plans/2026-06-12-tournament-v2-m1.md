# Tournament System v2 — M1 Implementation Plan（最小可验证闭环）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地赛事系统 v2 的 M1：完整数据模型 + 模板生成 + 结果重算/晋级边推进 + 积分榜/对阵图派生 + 最小录比分管理端 + 公开赛程/积分/对阵图页（SSE）。

**Architecture:** 纯 CRUD + 派生计算（spec rev.2：`docs/superpowers/specs/2026-06-12-tournament-v2-design.md`）。Match 结果是物化状态，由 score-service 在单事务内独占维护；晋级用独立边表；积分榜/对阵图每次现算。服务层纯函数（`db` 入参），路由只做 authz + Zod。

**Tech Stack:** Next.js 15 App Router、Prisma 5 + PostgreSQL 16、Zod、vitest（unit 名下的 DB 集成测试基建已存在）、SSE（EventEmitter bus，模式同 `src/server/draft-bus.ts`）。

**M1 范围外**（M2/M3 另出计划）：BP、选手数据、MVP、数据榜、英雄静态数据、审计页 UI、移动端打磨。注意：**数据库迁移包含全部表**（含 M2 用的 GameBanPick/GamePlayerStat），避免二次迁移；M1 只是不提供其录入/展示 UI。

**约定**：所有命令在仓库根执行；测试命令 `npx vitest run <file> --project unit`；每个 Task 结束必须 commit。现有模式参考：service 风格 `src/lib/season/season-service.ts`，错误类 `src/lib/season/errors.ts`，测试 DB `src/lib/test/db.ts`，SSE `src/server/draft-bus.ts`，路由守卫 `src/lib/api-guards.ts`。

---

### Task 1: Prisma schema + migration（全量表）

**Files:**
- Modify: `prisma/schema.prisma`（文件末尾追加）
- Modify: `src/lib/test/db.ts`（truncate 列表）

- [ ] **Step 1: 在 `prisma/schema.prisma` 末尾追加以下内容**

```prisma
// ============ Tournament v2 ============

enum StageType {
  GROUP
  KNOCKOUT
  CUSTOM
}

enum MatchStatus {
  SCHEDULED
  FINISHED
  WALKOVER
  CANCELED
}

enum MatchSource {
  GENERATED
  CUSTOM
}

enum AdvanceOutcome {
  WINNER
  LOSER
}

enum BanPickType {
  BAN
  PICK
}

enum TournamentStatus {
  SETUP
  GROUP_STAGE
  KNOCKOUT
  FINISHED
}

model Tournament {
  id        String           @id @default(cuid())
  seasonId  String           @unique
  name      String
  kind      String           @default("正赛")
  status    TournamentStatus @default(SETUP)
  config    Json
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  season Season            @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  stages TournamentStage[]
  teams  TournamentTeam[]
  matches Match[]

  @@map("tournaments")
}

model TournamentTeam {
  id           String @id @default(cuid())
  tournamentId String
  teamId       String

  tournament Tournament             @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  team       Team                   @relation(fields: [teamId], references: [id], onDelete: Restrict)
  players    TournamentTeamPlayer[]

  @@unique([tournamentId, teamId])
  @@map("tournament_teams")
}

model TournamentTeamPlayer {
  tournamentTeamId String
  registrationId   String

  tournamentTeam TournamentTeam @relation(fields: [tournamentTeamId], references: [id], onDelete: Cascade)
  registration   Registration   @relation(fields: [registrationId], references: [id], onDelete: Restrict)

  @@id([tournamentTeamId, registrationId])
  @@map("tournament_team_players")
}

model TournamentStage {
  id           String    @id @default(cuid())
  tournamentId String
  type         StageType
  name         String
  order        Int
  bestOf       Int
  config       Json?

  tournament Tournament        @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  groups     TournamentGroup[]
  matches    Match[]

  @@map("tournament_stages")
}

model TournamentGroup {
  id      String @id @default(cuid())
  stageId String
  name    String

  stage   TournamentStage       @relation(fields: [stageId], references: [id], onDelete: Cascade)
  teams   TournamentGroupTeam[]
  matches Match[]

  @@map("tournament_groups")
}

model TournamentGroupTeam {
  groupId String
  teamId  String

  group TournamentGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  team  Team            @relation(fields: [teamId], references: [id], onDelete: Restrict)

  @@id([groupId, teamId])
  @@map("tournament_group_teams")
}

model Match {
  id                 String      @id @default(cuid())
  tournamentId       String
  stageId            String
  groupId            String?
  label              String?
  roundKey           String?
  bestOf             Int
  source             MatchSource @default(GENERATED)
  countsForStandings Boolean     @default(true)
  teamAId            String?
  teamBId            String?
  scheduledAt        DateTime?
  status             MatchStatus @default(SCHEDULED)
  winnerTeamId       String?
  isWalkover         Boolean     @default(false)
  note               String?
  version            Int         @default(0)

  tournament Tournament       @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  stage      TournamentStage  @relation(fields: [stageId], references: [id], onDelete: Cascade)
  group      TournamentGroup? @relation(fields: [groupId], references: [id], onDelete: Cascade)
  teamA      Team?            @relation("MatchTeamA", fields: [teamAId], references: [id], onDelete: Restrict)
  teamB      Team?            @relation("MatchTeamB", fields: [teamBId], references: [id], onDelete: Restrict)
  winner     Team?            @relation("MatchWinner", fields: [winnerTeamId], references: [id], onDelete: Restrict)
  games      Game[]
  outEdges   MatchAdvancementEdge[] @relation("FromMatch")
  inEdges    MatchAdvancementEdge[] @relation("ToMatch")

  @@index([tournamentId, scheduledAt])
  @@index([stageId])
  @@index([groupId])
  @@map("matches")
}

model MatchAdvancementEdge {
  id          String         @id @default(cuid())
  fromMatchId String
  toMatchId   String
  outcome     AdvanceOutcome
  slot        String

  fromMatch Match @relation("FromMatch", fields: [fromMatchId], references: [id], onDelete: Cascade)
  toMatch   Match @relation("ToMatch", fields: [toMatchId], references: [id], onDelete: Cascade)

  @@unique([toMatchId, slot])
  @@unique([fromMatchId, outcome])
  @@map("match_advancement_edges")
}

model Game {
  id                String  @id @default(cuid())
  matchId           String
  index             Int
  isDraft           Boolean @default(true)
  blueTeamId        String?
  winnerTeamId      String?
  durationSeconds   Int?
  mvpRegistrationId String?

  match       Match            @relation(fields: [matchId], references: [id], onDelete: Cascade)
  bans        GameBanPick[]
  playerStats GamePlayerStat[]

  @@unique([matchId, index])
  @@index([matchId])
  @@map("games")
}

model GameBanPick {
  id         String      @id @default(cuid())
  gameId     String
  teamId     String
  type       BanPickType
  championId String
  order      Int

  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([gameId, order])
  @@unique([gameId, championId])
  @@index([gameId])
  @@map("game_ban_picks")
}

model GamePlayerStat {
  id             String @id @default(cuid())
  gameId         String
  teamId         String
  registrationId String
  championId     String
  kills          Int
  deaths         Int
  assists        Int
  cs             Int
  damage         Int
  gold           Int

  game         Game         @relation(fields: [gameId], references: [id], onDelete: Cascade)
  registration Registration @relation(fields: [registrationId], references: [id], onDelete: Restrict)

  @@unique([gameId, registrationId])
  @@index([registrationId])
  @@index([championId])
  @@map("game_player_stats")
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String
  entity    String
  entityId  String
  payload   Json?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

同时在现有模型上补反向关系字段（Prisma 要求双向声明）：
- `model Season` 内加：`tournament Tournament?`
- `model Team` 内加：
  ```prisma
  tournamentTeams  TournamentTeam[]
  groupMemberships TournamentGroupTeam[]
  matchesAsA       Match[] @relation("MatchTeamA")
  matchesAsB       Match[] @relation("MatchTeamB")
  matchesWon       Match[] @relation("MatchWinner")
  ```
- `model Registration` 内加：`tournamentRosters TournamentTeamPlayer[]` 与 `gameStats GamePlayerStat[]`

- [ ] **Step 2: 生成迁移并应用**

Run: `npx prisma migrate dev --name tournament_v2`
Expected: 迁移创建成功，`prisma/migrations/<ts>_tournament_v2/migration.sql` 出现，client 重新生成。

- [ ] **Step 3: 更新测试库 truncate 列表**

`src/lib/test/db.ts` 的 TRUNCATE 语句改为（新表放最前，保持原表顺序在后）：

```ts
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "game_player_stats", "game_ban_picks", "games",
      "match_advancement_edges", "matches", "tournament_group_teams",
      "tournament_groups", "tournament_stages", "tournament_team_players",
      "tournament_teams", "tournaments",
      "draft_events", "draft_picks", "draft_rounds", "draft_sessions",
      "team_slots", "teams", "registrations", "players", "users", "seasons"
    RESTART IDENTITY CASCADE;
  `);
```

- [ ] **Step 4: 对测试库应用迁移并跑现有测试确认无回归**

Run: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy && npx vitest run --project unit`
Expected: 全部现有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add prisma src/lib/test/db.ts
git commit -m "feat(tournament): v2 schema — teams snapshot, advancement edges, games, audit"
```

---

### Task 2: 错误类型与公共类型

**Files:**
- Create: `src/lib/tournament/errors.ts`
- Create: `src/lib/tournament/types.ts`

- [ ] **Step 1: 写 `src/lib/tournament/errors.ts`**（模式同 `src/lib/season/errors.ts`）

```ts
export type TournamentErrorCode =
  | 'SEASON_NOT_FOUND'
  | 'TOURNAMENT_EXISTS'
  | 'TOURNAMENT_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'INVALID_STATE'
  | 'TEAM_NOT_IN_SEASON'
  | 'MATCH_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DOWNSTREAM_RECORDED'
  | 'STANDINGS_TIED'
  | 'VALIDATION';

export class TournamentError extends Error {
  constructor(
    public code: TournamentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}
```

- [ ] **Step 2: 写 `src/lib/tournament/types.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

/** group-knockout 模板参数（Tournament.config 的 JSON 形状） */
export type GroupKnockoutConfig = {
  template: 'group-knockout';
  groupCount: number;
  teamsPerGroup: number;
  advancingPerGroup: number;
  groupBestOf: 1 | 3 | 5;
  /** roundKey → bestOf，如 { QF: 3, SF: 3, FINAL: 5 }；轮次按出线规模可能从 R16 起 */
  knockoutBestOf: Record<string, 1 | 3 | 5>;
};

/** 模板 generate 输出的纯数据骨架（未落库，service 负责持久化） */
export type Skeleton = {
  stages: Array<{
    type: 'GROUP' | 'KNOCKOUT';
    name: string;
    order: number;
    bestOf: number;
    groups: Array<{ name: string }>;
    matches: Array<{
      /** 引用：g{组序}:{a}v{b} 组内对阵用组内队序；ko:{roundKey}:{n} 淘汰赛位 */
      key: string;
      groupIndex: number | null;
      roundKey: string | null;
      label: string;
      bestOf: number;
      /** 组内对阵：组内队伍下标；淘汰赛首轮空缺 */
      teamAIndex: number | null;
      teamBIndex: number | null;
    }>;
  }>;
  /** 晋级边：fromKey 比赛的胜者去 toKey 的 slot 位 */
  edges: Array<{ fromKey: string; toKey: string; outcome: 'WINNER'; slot: 'A' | 'B' }>;
  /** 小组排名 → 淘汰赛首轮位的种子映射："{组序}-{名次}" → { matchKey, slot } */
  seedMap: Record<string, { matchKey: string; slot: 'A' | 'B' }>;
};

export interface TournamentTemplate {
  validate(config: unknown): GroupKnockoutConfig; // 抛 TournamentError('INVALID_CONFIG')
  generate(teamCount: number, config: GroupKnockoutConfig): Skeleton;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament/errors.ts src/lib/tournament/types.ts
git commit -m "feat(tournament): error and template type definitions"
```

---

### Task 3: group-knockout 模板（纯函数，TDD）

**Files:**
- Create: `src/lib/tournament/templates/group-knockout.ts`
- Test: `src/lib/tournament/templates/group-knockout.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { groupKnockout } from './group-knockout';

const cfg = (over: object = {}) => ({
  template: 'group-knockout',
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1,
  knockoutBestOf: { SF: 3, FINAL: 5 },
  ...over,
});

describe('validate', () => {
  it('接受 2组×4队×2出线（出线4 = 2^2）', () => {
    expect(() => groupKnockout.validate(cfg())).not.toThrow();
  });
  it('拒绝出线总数非 2 的幂', () => {
    expect(() => groupKnockout.validate(cfg({ groupCount: 3 }))).toThrow(/2 的幂/);
  });
  it('拒绝出线数 ≥ 每组队数', () => {
    expect(() => groupKnockout.validate(cfg({ advancingPerGroup: 4 }))).toThrow();
  });
});

describe('generate 2×4×2（出线4 → SF+FINAL）', () => {
  const sk = groupKnockout.generate(8, groupKnockout.validate(cfg()));

  it('生成 GROUP + KNOCKOUT 两个阶段、2 个组', () => {
    expect(sk.stages).toHaveLength(2);
    expect(sk.stages[0].groups.map((g) => g.name)).toEqual(['A', 'B']);
  });
  it('每组单循环 C(4,2)=6 场，共 12 场小组赛', () => {
    expect(sk.stages[0].matches).toHaveLength(12);
  });
  it('淘汰赛 = 2 场 SF + 1 场 FINAL，SF 胜者边指向 FINAL 两个位', () => {
    const ko = sk.stages[1].matches;
    expect(ko.filter((m) => m.roundKey === 'SF')).toHaveLength(2);
    expect(ko.filter((m) => m.roundKey === 'FINAL')).toHaveLength(1);
    expect(sk.edges).toHaveLength(2);
    expect(new Set(sk.edges.map((e) => e.slot))).toEqual(new Set(['A', 'B']));
  });
  it('种子映射交叉编排：A1–B2、B1–A2', () => {
    expect(sk.seedMap['0-1'].matchKey).toBe(sk.seedMap['1-2'].matchKey); // A1 与 B2 同场
    expect(sk.seedMap['1-1'].matchKey).toBe(sk.seedMap['0-2'].matchKey); // B1 与 A2 同场
    expect(sk.seedMap['0-1'].matchKey).not.toBe(sk.seedMap['1-1'].matchKey);
  });
  it('淘汰赛 bestOf 按轮次取 knockoutBestOf', () => {
    const ko = sk.stages[1].matches;
    expect(ko.find((m) => m.roundKey === 'SF')!.bestOf).toBe(3);
    expect(ko.find((m) => m.roundKey === 'FINAL')!.bestOf).toBe(5);
  });
});

describe('generate 4×4×2（出线8 → QF 起）', () => {
  const c = groupKnockout.validate(
    cfg({ groupCount: 4, knockoutBestOf: { QF: 3, SF: 3, FINAL: 5 } }),
  );
  const sk = groupKnockout.generate(16, c);
  it('QF×4 SF×2 FINAL×1，边数 = 6，端点闭合', () => {
    const ko = sk.stages[1].matches;
    expect(ko).toHaveLength(7);
    expect(sk.edges).toHaveLength(6);
    const keys = new Set(ko.map((m) => m.key));
    for (const e of sk.edges) {
      expect(keys.has(e.fromKey)).toBe(true);
      expect(keys.has(e.toKey)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/templates/group-knockout.test.ts --project unit`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `group-knockout.ts`**

```ts
import { TournamentError } from '../errors';
import type { GroupKnockoutConfig, Skeleton, TournamentTemplate } from '../types';

const GROUP_NAMES = 'ABCDEFGH';
/** 出线规模 → 轮次序列（首轮在前） */
const ROUNDS: Record<number, string[]> = {
  2: ['FINAL'],
  4: ['SF', 'FINAL'],
  8: ['QF', 'SF', 'FINAL'],
  16: ['R16', 'QF', 'SF', 'FINAL'],
};
const ROUND_LABEL: Record<string, string> = { R16: '十六强', QF: '四分之一决赛', SF: '半决赛', FINAL: '决赛' };

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function validate(raw: unknown): GroupKnockoutConfig {
  const c = raw as GroupKnockoutConfig;
  if (c?.template !== 'group-knockout') throw new TournamentError('INVALID_CONFIG', '未知模板');
  const { groupCount, teamsPerGroup, advancingPerGroup } = c;
  for (const [k, v] of Object.entries({ groupCount, teamsPerGroup, advancingPerGroup })) {
    if (!Number.isInteger(v) || v < 1) throw new TournamentError('INVALID_CONFIG', `${k} 必须为正整数`);
  }
  if (groupCount > GROUP_NAMES.length) throw new TournamentError('INVALID_CONFIG', '最多 8 个组');
  if (teamsPerGroup < 2) throw new TournamentError('INVALID_CONFIG', '每组至少 2 队');
  if (advancingPerGroup >= teamsPerGroup)
    throw new TournamentError('INVALID_CONFIG', '出线数必须小于每组队数');
  const advancing = groupCount * advancingPerGroup;
  if (!isPowerOfTwo(advancing) || !ROUNDS[advancing])
    throw new TournamentError('INVALID_CONFIG', `出线总数 ${advancing} 必须是 2 的幂（2/4/8/16）`);
  for (const round of ROUNDS[advancing]) {
    const bo = c.knockoutBestOf?.[round];
    if (bo !== 1 && bo !== 3 && bo !== 5)
      throw new TournamentError('INVALID_CONFIG', `缺少轮次 ${round} 的 BO 配置`);
  }
  if (![1, 3, 5].includes(c.groupBestOf))
    throw new TournamentError('INVALID_CONFIG', '小组赛 BO 配置非法');
  return c;
}

function generate(teamCount: number, c: GroupKnockoutConfig): Skeleton {
  if (teamCount !== c.groupCount * c.teamsPerGroup)
    throw new TournamentError('INVALID_CONFIG', `需要 ${c.groupCount * c.teamsPerGroup} 支队伍，实际 ${teamCount}`);

  // —— 小组赛：每组单循环 ——
  const groupStageMatches: Skeleton['stages'][number]['matches'] = [];
  for (let g = 0; g < c.groupCount; g++) {
    for (let a = 0; a < c.teamsPerGroup; a++) {
      for (let b = a + 1; b < c.teamsPerGroup; b++) {
        groupStageMatches.push({
          key: `g${g}:${a}v${b}`,
          groupIndex: g,
          roundKey: null,
          label: `${GROUP_NAMES[g]} 组`,
          bestOf: c.groupBestOf,
          teamAIndex: a,
          teamBIndex: b,
        });
      }
    }
  }

  // —— 淘汰赛：按轮次铺空位比赛 + 胜者边 ——
  const advancing = c.groupCount * c.advancingPerGroup;
  const rounds = ROUNDS[advancing];
  const koMatches: Skeleton['stages'][number]['matches'] = [];
  const edges: Skeleton['edges'] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = advancing / 2 ** (r + 1);
    for (let i = 0; i < count; i++) {
      koMatches.push({
        key: `ko:${rounds[r]}:${i}`,
        groupIndex: null,
        roundKey: rounds[r],
        label: count === 1 ? ROUND_LABEL[rounds[r]] : `${ROUND_LABEL[rounds[r]]} ${i + 1}`,
        bestOf: c.knockoutBestOf[rounds[r]],
        teamAIndex: null,
        teamBIndex: null,
      });
      if (r > 0) {
        // 本轮第 i 场接收上一轮第 2i、2i+1 场的胜者
        edges.push({ fromKey: `ko:${rounds[r - 1]}:${2 * i}`, toKey: `ko:${rounds[r]}:${i}`, outcome: 'WINNER', slot: 'A' });
        edges.push({ fromKey: `ko:${rounds[r - 1]}:${2 * i + 1}`, toKey: `ko:${rounds[r]}:${i}`, outcome: 'WINNER', slot: 'B' });
      }
    }
  }

  // —— 种子映射：标准交叉（首轮第 i 场：seed[i] vs seed[N-1-i]）——
  // 出线序列按"名次优先、组序次之"：[A1,B1,…,A2,B2,…]。
  // 首尾配对天然交叉：2组2出线 → A1–B2 / B1–A2；4组2出线 → A1–D2 / B1–C2 / C1–B2 / D1–A2，
  // 且同组两队分属对位（半区）两端，不会在首轮相遇。
  const seeds: string[] = [];
  for (let rank = 1; rank <= c.advancingPerGroup; rank++) {
    for (let g = 0; g < c.groupCount; g++) {
      seeds.push(`${g}-${rank}`);
    }
  }
  const firstRound = rounds[0];
  const firstCount = advancing / 2;
  const seedMap: Skeleton['seedMap'] = {};
  for (let i = 0; i < firstCount; i++) {
    seedMap[seeds[i]] = { matchKey: `ko:${firstRound}:${i}`, slot: 'A' };
    seedMap[seeds[advancing - 1 - i]] = { matchKey: `ko:${firstRound}:${i}`, slot: 'B' };
  }

  return {
    stages: [
      { type: 'GROUP', name: '小组赛', order: 1, bestOf: c.groupBestOf, groups: Array.from({ length: c.groupCount }, (_, g) => ({ name: GROUP_NAMES[g] })), matches: groupStageMatches },
      { type: 'KNOCKOUT', name: '淘汰赛', order: 2, bestOf: c.knockoutBestOf[rounds[rounds.length - 1]], groups: [], matches: koMatches },
    ],
    edges,
    seedMap,
  };
}

export const groupKnockout: TournamentTemplate = { validate, generate };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tournament/templates/group-knockout.test.ts --project unit`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/templates
git commit -m "feat(tournament): group-knockout template — validate, generate, seed map"
```

---

### Task 4: audit 写入助手

**Files:**
- Create: `src/lib/tournament/audit.ts`

- [ ] **Step 1: 实现（小到不单独立测，由后续 service 测试覆盖）**

```ts
import type { Prisma } from '@prisma/client';
import type { Db } from './types';

export async function writeAudit(
  db: Db,
  entry: {
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    payload?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLog.create({ data: entry });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tournament/audit.ts
git commit -m "feat(tournament): audit log helper"
```

---

### Task 5: tournament-service — 创建（含阵容快照）/查询/删除（TDD）

**Files:**
- Create: `src/lib/tournament/test-fixtures.ts`
- Create: `src/lib/tournament/tournament-service.ts`
- Test: `src/lib/tournament/tournament-service.test.ts`

- [ ] **Step 1: 写 `src/lib/tournament/test-fixtures.ts`**

```ts
import { testDb } from '@/lib/test/db';

/** 造一个 season + n 支队（每队 1 个队长报名 + user），返回 ids */
export async function seedSeasonWithTeams(n: number) {
  const season = await testDb.season.create({
    data: { name: 'S-test', status: 'COMPLETED', teamBudget: 1000 },
  });
  const teamIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const player = await testDb.player.create({
      data: { gameId: `cap-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `队长${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId: season.id,
        playerId: player.id,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        cost: 100,
        status: 'APPROVED',
        isCaptain: true,
      },
    });
    const user = await testDb.user.create({
      data: { username: `cap-${i}-${season.id.slice(-4)}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const team = await testDb.team.create({
      data: { seasonId: season.id, name: `队伍${i}`, captainId: reg.id, userId: user.id },
    });
    await testDb.teamSlot.create({
      data: { teamId: team.id, position: 'MID', registrationId: reg.id },
    });
    teamIds.push(team.id);
  }
  return { seasonId: season.id, teamIds };
}

export const CFG_2x4x2 = {
  template: 'group-knockout' as const,
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1 as const,
  knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
};
```

> 注意：`Registration`/`Team` 的必填字段以当前 `prisma/schema.prisma` 为准；如有出入（字段名、枚举值），按 schema 调整**夹具**，不要改业务表。

- [ ] **Step 2: 写失败测试 `tournament-service.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament, deleteTournament, getTournamentBySeason } from './tournament-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

describe('createTournament', () => {
  it('创建赛事：阶段/分组占位/淘汰赛比赛/晋级边/阵容快照全部落库', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTournament(testDb, {
      seasonId,
      name: 'S1 赛事',
      teamIds,
      config: CFG_2x4x2,
      actorUserId: 'admin-1',
    });
    expect(t.status).toBe('SETUP');
    // 阶段：GROUP + KNOCKOUT；组 A/B；淘汰赛 SF×2 + FINAL×1（小组赛对阵在分组确认后才生成）
    const stages = await testDb.tournamentStage.findMany({ where: { tournamentId: t.id } });
    expect(stages).toHaveLength(2);
    expect(await testDb.tournamentGroup.count()).toBe(2);
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
    expect(await testDb.matchAdvancementEdge.count()).toBe(2);
    // 快照：8 队 × 1 人
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
    expect(await testDb.tournamentTeamPlayer.count()).toBe(8);
    // 审计
    expect(await testDb.auditLog.count({ where: { action: 'tournament.create' } })).toBe(1);
  });

  it('同赛季重复创建被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const input = { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' };
    await createTournament(testDb, input);
    await expect(createTournament(testDb, input)).rejects.toThrow(/已存在/);
  });

  it('队伍数与配置不符被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(6);
    await expect(
      createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' }),
    ).rejects.toThrow(/需要 8 支队伍/);
  });

  it('异赛季队伍被拒（跨赛季校验）', async () => {
    const a = await seedSeasonWithTeams(7);
    const b = await seedSeasonWithTeams(1);
    await expect(
      createTournament(testDb, {
        seasonId: a.seasonId,
        name: 'x',
        teamIds: [...a.teamIds, ...b.teamIds],
        config: CFG_2x4x2,
        actorUserId: 'u',
      }),
    ).rejects.toThrow(/不属于该赛季/);
  });
});

describe('deleteTournament', () => {
  it('SETUP 状态可删，级联清空', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    await deleteTournament(testDb, { tournamentId: t.id, actorUserId: 'u' });
    expect(await getTournamentBySeason(testDb, seasonId)).toBeNull();
    expect(await testDb.match.count()).toBe(0);
  });
});
```

> `seedSeasonWithTeams` 连续调用两次会产生两个非归档赛季？不会——夹具直接 create，绕过 `createSeason` 的归档逻辑；测试场景允许。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/tournament-service.test.ts --project unit`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 `tournament-service.ts`**

```ts
import type { PrismaClient, Tournament } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { Db, GroupKnockoutConfig } from './types';

export async function getTournamentBySeason(db: Db, seasonId: string): Promise<Tournament | null> {
  return db.tournament.findUnique({ where: { seasonId } });
}

export async function createTournament(
  db: PrismaClient,
  input: {
    seasonId: string;
    name: string;
    kind?: string; // 类型标签：正赛/娱乐赛/海斗/自定义；缺省"正赛"
    teamIds: string[];
    config: GroupKnockoutConfig;
    actorUserId: string;
  },
): Promise<Tournament> {
  const config = groupKnockout.validate(input.config);

  const season = await db.season.findUnique({ where: { id: input.seasonId } });
  if (!season) throw new TournamentError('SEASON_NOT_FOUND', '赛季不存在');
  if (await db.tournament.findUnique({ where: { seasonId: input.seasonId } }))
    throw new TournamentError('TOURNAMENT_EXISTS', '该赛季已存在赛事');

  // 跨赛季校验：所有队伍必须属于该赛季
  const teams = await db.team.findMany({
    where: { id: { in: input.teamIds } },
    include: { slots: { where: { registrationId: { not: null } } } },
  });
  if (teams.length !== input.teamIds.length || teams.some((t) => t.seasonId !== input.seasonId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '存在不属于该赛季的队伍');

  const skeleton = groupKnockout.generate(input.teamIds.length, config);

  return db.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: { seasonId: input.seasonId, name: input.name, kind: input.kind ?? '正赛', status: 'SETUP', config },
    });

    // 阵容快照（来自当前 TeamSlot 占用者）
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

    // 阶段 + 组 + 淘汰赛比赛 + 晋级边（小组赛对阵在 confirmGroups 时生成）
    const matchIdByKey = new Map<string, string>();
    for (const stage of skeleton.stages) {
      const st = await tx.tournamentStage.create({
        data: { tournamentId: t.id, type: stage.type, name: stage.name, order: stage.order, bestOf: stage.bestOf },
      });
      for (const g of stage.groups) {
        await tx.tournamentGroup.create({ data: { stageId: st.id, name: g.name } });
      }
      if (stage.type !== 'KNOCKOUT') continue; // 小组赛对阵在分组确认后才生成
      for (const m of stage.matches) {
        const created = await tx.match.create({
          data: {
            tournamentId: t.id,
            stageId: st.id,
            label: m.label,
            roundKey: m.roundKey,
            bestOf: m.bestOf,
          },
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

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.create',
      entity: 'Tournament',
      entityId: t.id,
      payload: { name: input.name, config: config as object },
    });
    return t;
  });
}

export async function deleteTournament(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await db.$transaction(async (tx) => {
    await tx.tournament.delete({ where: { id: t.id } }); // 全链 Cascade
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.delete',
      entity: 'Tournament',
      entityId: t.id,
      payload: { name: t.name },
    });
  });
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/lib/tournament/tournament-service.test.ts --project unit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament
git commit -m "feat(tournament): create/delete service with roster snapshot and edges"
```

---

### Task 6: 分组确认 — groups-service（TDD）

**Files:**
- Create: `src/lib/tournament/groups-service.ts`
- Test: `src/lib/tournament/groups-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, {
    seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u',
  });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  return { t, teamIds, groups };
}

it('assignGroups 写入成员；队数不符被拒', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentGroupTeam.count()).toBe(8);

  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 3) },
        { groupId: groups[1].id, teamIds: teamIds.slice(3) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/每组 4 支/);
});

it('confirmGroups 生成组内单循环并置 GROUP_STAGE；重复确认被拒', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  expect(groupMatches).toHaveLength(12); // 2 组 × C(4,2)
  expect(groupMatches.every((m) => m.teamAId && m.teamBId && m.bestOf === 1)).toBe(true);
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('GROUP_STAGE');

  await expect(confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/状态/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/groups-service.test.ts --project unit`
Expected: FAIL。

- [ ] **Step 3: 实现 `groups-service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { GroupKnockoutConfig } from './types';

export async function assignGroups(
  db: PrismaClient,
  input: {
    tournamentId: string;
    assignments: Array<{ groupId: string; teamIds: string[] }>;
    actorUserId: string;
  },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, include: { teams: true } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许调整分组');

  const cfg = t.config as GroupKnockoutConfig;
  const snapshotTeamIds = new Set(t.teams.map((x) => x.teamId));
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (a.teamIds.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `每组 ${cfg.teamsPerGroup} 支队伍`);
    for (const id of a.teamIds) {
      if (!snapshotTeamIds.has(id)) throw new TournamentError('TEAM_NOT_IN_SEASON', '队伍不在参赛名单');
      if (seen.has(id)) throw new TournamentError('VALIDATION', '队伍重复分组');
      seen.add(id);
    }
  }
  if (seen.size !== snapshotTeamIds.size) throw new TournamentError('VALIDATION', '有队伍未分组');

  await db.$transaction(async (tx) => {
    await tx.tournamentGroupTeam.deleteMany({
      where: { group: { stage: { tournamentId: t.id } } },
    });
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

/** 确认分组：生成组内单循环对阵，状态 SETUP → GROUP_STAGE */
export async function confirmGroups(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      stages: { include: { groups: { include: { teams: true } } } },
    },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许确认分组');

  const cfg = t.config as GroupKnockoutConfig;
  const groupStage = t.stages.find((s) => s.type === 'GROUP')!;
  for (const g of groupStage.groups) {
    if (g.teams.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `${g.name} 组未分满`);
  }

  await db.$transaction(async (tx) => {
    for (const g of groupStage.groups) {
      const ids = g.teams.map((x) => x.teamId);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          await tx.match.create({
            data: {
              tournamentId: t.id,
              stageId: groupStage.id,
              groupId: g.id,
              label: `${g.name} 组`,
              bestOf: cfg.groupBestOf,
              teamAId: ids[a],
              teamBId: ids[b],
            },
          });
        }
      }
    }
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'GROUP_STAGE' } });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.groups.confirm',
      entity: 'Tournament',
      entityId: t.id,
    });
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tournament/groups-service.test.ts --project unit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/groups-service.ts src/lib/tournament/groups-service.test.ts
git commit -m "feat(tournament): group assignment and round-robin confirmation"
```

---

### Task 7: standings 派生（纯函数，TDD，无 DB）

**Files:**
- Create: `src/lib/tournament/standings.ts`
- Test: `src/lib/tournament/standings.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsMatch } from './standings';

const m = (a: string, b: string, winner: string | null, over: Partial<StandingsMatch> = {}): StandingsMatch => ({
  teamAId: a, teamBId: b, winnerTeamId: winner,
  status: winner ? 'FINISHED' : 'SCHEDULED',
  countsForStandings: true,
  ...over,
});

describe('computeStandings', () => {
  it('胜1负0；按积分排序', () => {
    const rows = computeStandings(['t1', 't2', 't3'], [
      m('t1', 't2', 't1'), m('t1', 't3', 't1'), m('t2', 't3', 't2'),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['t1', 't2', 't3']);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 0, points: 2, rank: 1, tied: false });
  });

  it('三队连环同分 → 全部标 tied', () => {
    const rows = computeStandings(['t1', 't2', 't3'], [
      m('t2', 't1', 't2'), m('t1', 't3', 't1'), m('t2', 't3', 't3'),
    ]);
    expect(rows.every((r) => r.tied)).toBe(true);
  });

  it('同分头对头可分 → 不标 tied', () => {
    const rows = computeStandings(['t1', 't2', 't3', 't4'], [
      m('t1', 't2', 't1'), m('t3', 't4', 't3'),
      m('t1', 't3', 't1'), m('t2', 't4', 't2'),
      m('t1', 't4', 't1'), m('t2', 't3', 't2'),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['t1', 't2', 't3', 't4']);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it('WALKOVER 计分、CANCELED 与 countsForStandings=false 不计', () => {
    const rows = computeStandings(['t1', 't2'], [
      m('t1', 't2', 't1', { status: 'WALKOVER' }),
      m('t1', 't2', 't2', { status: 'CANCELED' }),
      m('t1', 't2', 't2', { countsForStandings: false }),
    ]);
    expect(rows[0]).toMatchObject({ teamId: 't1', points: 1 });
    expect(rows[1]).toMatchObject({ teamId: 't2', points: 0 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/standings.test.ts --project unit`
Expected: FAIL。

- [ ] **Step 3: 实现 `standings.ts`**

```ts
export type StandingsMatch = {
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  status: 'SCHEDULED' | 'FINISHED' | 'WALKOVER' | 'CANCELED';
  countsForStandings: boolean;
};

export type StandingsRow = {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  rank: number;
  /** 与同分簇内队伍经头对头仍无法完全定序 */
  tied: boolean;
};

/** 计入积分的完赛：FINISHED 或 WALKOVER，且 countsForStandings */
function counted(ms: StandingsMatch[]): StandingsMatch[] {
  return ms.filter(
    (m) =>
      m.countsForStandings &&
      (m.status === 'FINISHED' || m.status === 'WALKOVER') &&
      m.winnerTeamId !== null && m.teamAId !== null && m.teamBId !== null,
  );
}

function tally(teamIds: string[], played: StandingsMatch[]): Map<string, StandingsRow> {
  const rows = new Map<string, StandingsRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, losses: 0, points: 0, rank: 0, tied: false }]),
  );
  for (const m of played) {
    const a = rows.get(m.teamAId!);
    const b = rows.get(m.teamBId!);
    if (!a || !b) continue;
    a.played++; b.played++;
    const winner = rows.get(m.winnerTeamId!)!;
    const loser = winner === a ? b : a;
    winner.wins++; winner.points++; loser.losses++;
  }
  return rows;
}

export function computeStandings(teamIds: string[], matches: StandingsMatch[]): StandingsRow[] {
  const played = counted(matches);
  const rows = tally(teamIds, played);

  // 先按积分降序聚簇；同分簇内用头对头小子表重排，仍不能全分则整簇标 tied
  const byPoints = [...rows.values()].sort((x, y) => y.points - x.points);
  const result: StandingsRow[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
    const cluster = byPoints.slice(i, j);
    if (cluster.length > 1) {
      const ids = new Set(cluster.map((r) => r.teamId));
      const h2hRows = tally(
        [...ids],
        played.filter((m) => ids.has(m.teamAId!) && ids.has(m.teamBId!)),
      );
      cluster.sort(
        (x, y) => (h2hRows.get(y.teamId)!.points) - (h2hRows.get(x.teamId)!.points),
      );
      const distinct = new Set(cluster.map((r) => h2hRows.get(r.teamId)!.points));
      const fullyOrdered = distinct.size === cluster.length;
      for (const r of cluster) r.tied = !fullyOrdered;
    }
    result.push(...cluster);
    i = j;
  }
  result.forEach((r, idx) => (r.rank = idx + 1));
  return result;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tournament/standings.test.ts --project unit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/standings.ts src/lib/tournament/standings.test.ts
git commit -m "feat(tournament): standings derivation with head-to-head tiebreak"
```

---

### Task 8: score-service — 结果权威 + 晋级推进（TDD，M1 核心）

**Files:**
- Create: `src/lib/tournament/score-service.ts`
- Test: `src/lib/tournament/score-service.test.ts`

M1 录入形态：`recordGame`（录一局胜负，无 BP/选手数据）、`deleteGame`、`setWalkover`、`cancelMatch`、`rescheduleMatch`。**所有写操作带 `expectedVersion`**；任何 Game 变更后同事务重算 Match 物化结果并沿 WINNER 边推进/回收。

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { deleteGame, recordGame, setWalkover } from './score-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

/** 完整走到小组赛开打的夹具 */
export async function setupGroupStage() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/score-service.test.ts --project unit`
Expected: FAIL（score-service 与 bracket-service 均未实现；淘汰赛用例待 Task 9 后全绿）。

- [ ] **Step 3: 实现 `score-service.ts`**

```ts
import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { Db } from './types';

/** 取 Match 并校验版本 */
async function lockMatch(db: Db, matchId: string, expectedVersion: number): Promise<Match> {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) throw new TournamentError('MATCH_NOT_FOUND', '比赛不存在');
  if (match.version !== expectedVersion)
    throw new TournamentError('VERSION_CONFLICT', 'VERSION_CONFLICT：比赛已被他人修改，请刷新');
  return match;
}

function winsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

/** 下游链上是否已有录入（Game 或非 SCHEDULED 状态）；有则拒绝 */
async function assertDownstreamClean(db: Db, matchId: string): Promise<void> {
  const edges = await db.matchAdvancementEdge.findMany({ where: { fromMatchId: matchId } });
  for (const e of edges) {
    const to = await db.match.findUnique({
      where: { id: e.toMatchId },
      include: { _count: { select: { games: true } } },
    });
    if (!to) continue;
    if (to._count.games > 0 || to.status !== 'SCHEDULED')
      throw new TournamentError('DOWNSTREAM_RECORDED', 'DOWNSTREAM_RECORDED：下游比赛已有记录，请先删除下游数据');
    await assertDownstreamClean(db, to.id);
  }
}

/** 重算 Match 物化结果并沿 WINNER 边推进/回收（调用方保证在事务内） */
async function resettleMatch(tx: Db, matchId: string): Promise<void> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { games: { where: { isDraft: false } } },
  });
  if (!match) return;

  const need = winsNeeded(match.bestOf);
  const winsByTeam = new Map<string, number>();
  for (const g of match.games) {
    if (g.winnerTeamId) winsByTeam.set(g.winnerTeamId, (winsByTeam.get(g.winnerTeamId) ?? 0) + 1);
  }
  const settledWinner = [...winsByTeam.entries()].find(([, w]) => w >= need)?.[0] ?? null;

  await tx.match.update({
    where: { id: matchId },
    data: {
      status: settledWinner ? 'FINISHED' : 'SCHEDULED',
      winnerTeamId: settledWinner,
      isWalkover: false,
    },
  });
  await propagate(tx, matchId, settledWinner);
}

/** 把（新的）胜者写到 WINNER 边目标位；胜者为 null 时回收 */
async function propagate(tx: Db, matchId: string, winnerTeamId: string | null): Promise<void> {
  const edges = await tx.matchAdvancementEdge.findMany({
    where: { fromMatchId: matchId, outcome: 'WINNER' },
  });
  for (const e of edges) {
    await tx.match.update({
      where: { id: e.toMatchId },
      data: e.slot === 'A' ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId },
    });
  }
}

export async function recordGame(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; winnerTeamId: string; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    if (match.status === 'CANCELED' || match.status === 'WALKOVER')
      throw new TournamentError('INVALID_STATE', '该比赛状态不允许录入');
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');
    if (![match.teamAId, match.teamBId].includes(input.winnerTeamId))
      throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
    if (match.status === 'FINISHED') await assertDownstreamClean(tx, match.id); // 加局 = 改判

    const count = await tx.game.count({ where: { matchId: match.id } });
    if (count >= match.bestOf) throw new TournamentError('VALIDATION', '局数已达上限');

    await tx.game.create({
      data: { matchId: match.id, index: count + 1, isDraft: false, winnerTeamId: input.winnerTeamId },
    });
    await resettleMatch(tx, match.id);
    await tx.match.update({ where: { id: match.id }, data: { version: { increment: 1 } } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.record',
      entity: 'Match', entityId: match.id,
      payload: { gameIndex: count + 1, winnerTeamId: input.winnerTeamId },
    });
  });
}

export async function deleteGame(
  db: PrismaClient,
  input: { matchId: string; gameId: string; expectedVersion: number; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await assertDownstreamClean(tx, match.id);
    await tx.game.delete({ where: { id: input.gameId } });
    await resettleMatch(tx, match.id);
    await tx.match.update({ where: { id: match.id }, data: { version: { increment: 1 } } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.delete',
      entity: 'Match', entityId: match.id, payload: { gameId: input.gameId },
    });
  });
}

export async function setWalkover(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; winnerTeamId: string; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');
    if (![match.teamAId, match.teamBId].includes(input.winnerTeamId))
      throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
    if ((await tx.game.count({ where: { matchId: match.id } })) > 0)
      throw new TournamentError('INVALID_STATE', '已有局记录，不能轮空');
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'WALKOVER', winnerTeamId: input.winnerTeamId, isWalkover: true, version: { increment: 1 } },
    });
    await propagate(tx, match.id, input.winnerTeamId);
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.walkover',
      entity: 'Match', entityId: match.id, payload: { winnerTeamId: input.winnerTeamId },
    });
  });
}

export async function cancelMatch(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await assertDownstreamClean(tx, match.id);
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'CANCELED', winnerTeamId: null, version: { increment: 1 } },
    });
    await propagate(tx, match.id, null);
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.cancel', entity: 'Match', entityId: match.id,
    });
  });
}

export async function rescheduleMatch(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; scheduledAt: Date | null; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await tx.match.update({
      where: { id: match.id },
      data: { scheduledAt: input.scheduledAt, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.reschedule',
      entity: 'Match', entityId: match.id, payload: { scheduledAt: input.scheduledAt?.toISOString() ?? null },
    });
  });
}
```

- [ ] **Step 4: 先跑不依赖 bracket-service 的用例**

Run: `npx vitest run src/lib/tournament/score-service.test.ts --project unit -t "BO1"`
Expected: PASS（其余淘汰赛用例 Task 9 后全绿）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/score-service.ts src/lib/tournament/score-service.test.ts
git commit -m "feat(tournament): score service — settle, propagate, retraction guards"
```

---

### Task 9: bracket-service — 收小组 + 种子填位；bracket 派生（TDD）

**Files:**
- Create: `src/lib/tournament/bracket-service.ts`
- Create: `src/lib/tournament/bracket.ts`
- Test: `src/lib/tournament/bracket-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function playAllGroupMatches(teamIds: string[]) {
  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
}

async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
  return { t, teamIds };
}

it('小组未赛完不能收', async () => {
  const { t } = await setup();
  await expect(closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/未完成/);
});

it('收小组：按名次交叉填入首轮，状态 → KNOCKOUT', async () => {
  const { t, teamIds } = await setup();
  await playAllGroupMatches(teamIds);
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const status = (await testDb.tournament.findUnique({ where: { id: t.id } }))!.status;
  expect(status).toBe('KNOCKOUT');

  // A 组 = teamIds[0..3]（0 全胜 → A1, 1 → A2）；B 组 = teamIds[4..7]
  const sfs = await testDb.match.findMany({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } });
  const pairs = sfs.map((m) => [m.teamAId, m.teamBId]);
  // 交叉：A1–B2 与 B1–A2
  expect(pairs).toContainEqual([teamIds[0], teamIds[5]]);
  expect(pairs).toContainEqual([teamIds[4], teamIds[1]]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/bracket-service.test.ts --project unit`
Expected: FAIL。

- [ ] **Step 3: 实现 `bracket-service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { computeStandings } from './standings';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { GroupKnockoutConfig } from './types';

/** 收小组：校验全部完赛、出线名次无 tie，按 seedMap 填首轮，状态 → KNOCKOUT */
export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      stages: {
        include: {
          groups: { include: { teams: true }, orderBy: { name: 'asc' } },
          matches: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'GROUP_STAGE') throw new TournamentError('INVALID_STATE', '当前状态不能收小组');

  const cfg = t.config as GroupKnockoutConfig;
  const groupStage = t.stages.find((s) => s.type === 'GROUP')!;

  // 各组名次 → 出线者
  const advancerByKey = new Map<string, string>(); // "{组序}-{名次}" → teamId
  for (let g = 0; g < groupStage.groups.length; g++) {
    const group = groupStage.groups[g];
    const ms = groupStage.matches.filter((m) => m.groupId === group.id);
    if (ms.some((m) => m.status === 'SCHEDULED'))
      throw new TournamentError('INVALID_STATE', `${group.name} 组比赛未完成`);
    const rows = computeStandings(
      group.teams.map((x) => x.teamId),
      ms.map((m) => ({
        teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
        status: m.status, countsForStandings: m.countsForStandings,
      })),
    );
    for (let rank = 1; rank <= cfg.advancingPerGroup; rank++) {
      const row = rows[rank - 1];
      if (row.tied)
        throw new TournamentError('STANDINGS_TIED', `${group.name} 组名次并列无法出线，请安排加赛`);
      advancerByKey.set(`${g}-${rank}`, row.teamId);
    }
  }

  // skeleton 的 seedMap → DB match：用 (roundKey, label) 对齐
  const skeleton = groupKnockout.generate(cfg.groupCount * cfg.teamsPerGroup, cfg);
  const koStage = t.stages.find((s) => s.type === 'KNOCKOUT')!;
  const skeletonKo = skeleton.stages.find((s) => s.type === 'KNOCKOUT')!.matches;
  const dbIdByKey = new Map<string, string>();
  for (const sm of skeletonKo) {
    const dbm = koStage.matches.find((m) => m.roundKey === sm.roundKey && m.label === sm.label);
    if (!dbm) throw new TournamentError('INVALID_STATE', '淘汰赛骨架与库不一致');
    dbIdByKey.set(sm.key, dbm.id);
  }

  await db.$transaction(async (tx) => {
    for (const [seedKey, target] of Object.entries(skeleton.seedMap)) {
      const teamId = advancerByKey.get(seedKey);
      if (!teamId) continue;
      await tx.match.update({
        where: { id: dbIdByKey.get(target.matchKey)! },
        data: target.slot === 'A' ? { teamAId: teamId } : { teamBId: teamId },
      });
    }
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'KNOCKOUT' } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'tournament.groupstage.close',
      entity: 'Tournament', entityId: t.id,
    });
  });
}
```

- [ ] **Step 4: 实现 `bracket.ts`（对阵树视图模型纯函数）**

```ts
export type BracketMatch = {
  id: string;
  roundKey: string | null;
  label: string | null;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  status: string;
};

export type BracketRound = { roundKey: string; matches: BracketMatch[] };

const ROUND_ORDER = ['R16', 'QF', 'SF', 'FINAL'];

export function buildBracket(matches: BracketMatch[]): BracketRound[] {
  return ROUND_ORDER.filter((r) => matches.some((m) => m.roundKey === r)).map((roundKey) => ({
    roundKey,
    matches: matches
      .filter((m) => m.roundKey === roundKey)
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'zh')),
  }));
}
```

- [ ] **Step 5: 全量跑 tournament 测试（含 Task 8 留下的淘汰赛用例）**

Run: `npx vitest run src/lib/tournament --project unit`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament
git commit -m "feat(tournament): close group stage with seeding, bracket view model"
```

---

### Task 9b: schedule-service — 自定义加赛（TDD；STANDINGS_TIED 的出口）

**Files:**
- Create: `src/lib/tournament/schedule-service.ts`
- Test: `src/lib/tournament/schedule-service.test.ts`

没有它，小组并列（STANDINGS_TIED）在 M1 就是死路：收小组被拒后管理员无法安排加赛。

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { addCustomMatch } from './schedule-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
  return { t, teamIds, groups };
}

it('挂组加赛：source=CUSTOM、计分、双方必须同组', async () => {
  const { t, teamIds, groups } = await setup();
  const m = await addCustomMatch(testDb, {
    tournamentId: t.id,
    groupId: groups[0].id,
    teamAId: teamIds[0],
    teamBId: teamIds[1],
    bestOf: 1,
    label: '加赛',
    countsForStandings: true,
    actorUserId: 'u',
  });
  expect(m.source).toBe('CUSTOM');
  expect(m.countsForStandings).toBe(true);
  expect(m.groupId).toBe(groups[0].id);

  // 跨组队伍 → 拒绝
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: groups[0].id,
      teamAId: teamIds[0], teamBId: teamIds[4],
      bestOf: 1, label: 'bad', countsForStandings: true, actorUserId: 'u',
    }),
  ).rejects.toThrow(/同组/);
});

it('不挂组的表演赛：不计分，挂在 KNOCKOUT 阶段', async () => {
  const { t, teamIds } = await setup();
  const m = await addCustomMatch(testDb, {
    tournamentId: t.id, groupId: null,
    teamAId: teamIds[0], teamBId: teamIds[4],
    bestOf: 3, label: '表演赛', countsForStandings: false, actorUserId: 'u',
  });
  expect(m.countsForStandings).toBe(false);
  expect(m.groupId).toBeNull();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tournament/schedule-service.test.ts --project unit`
Expected: FAIL。

- [ ] **Step 3: 实现 `schedule-service.ts`**

```ts
import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';

export async function addCustomMatch(
  db: PrismaClient,
  input: {
    tournamentId: string;
    groupId: string | null;
    teamAId: string;
    teamBId: string;
    bestOf: number;
    label: string;
    countsForStandings: boolean;
    scheduledAt?: Date | null;
    actorUserId: string;
  },
): Promise<Match> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { teams: true, stages: { include: { groups: { include: { teams: true } } } } },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status === 'FINISHED') throw new TournamentError('INVALID_STATE', '赛事已结束');
  if (input.teamAId === input.teamBId) throw new TournamentError('VALIDATION', '双方不能相同');
  if (![1, 3, 5].includes(input.bestOf)) throw new TournamentError('VALIDATION', 'BO 数非法');

  const snapshot = new Set(t.teams.map((x) => x.teamId));
  if (!snapshot.has(input.teamAId) || !snapshot.has(input.teamBId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '队伍不在参赛名单');

  let stageId: string;
  if (input.groupId) {
    const group = t.stages.flatMap((s) => s.groups).find((g) => g.id === input.groupId);
    if (!group) throw new TournamentError('VALIDATION', '小组不存在');
    const memberIds = new Set(group.teams.map((x) => x.teamId));
    if (!memberIds.has(input.teamAId) || !memberIds.has(input.teamBId))
      throw new TournamentError('VALIDATION', '加赛双方必须同组');
    stageId = group.stageId;
  } else {
    // 不挂组：放到 KNOCKOUT 阶段名下（仅作归属展示）
    stageId = t.stages.find((s) => s.type === 'KNOCKOUT')!.id;
  }

  return db.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        tournamentId: t.id,
        stageId,
        groupId: input.groupId,
        label: input.label,
        bestOf: input.bestOf,
        source: 'CUSTOM',
        countsForStandings: input.countsForStandings,
        teamAId: input.teamAId,
        teamBId: input.teamBId,
        scheduledAt: input.scheduledAt ?? null,
      },
    });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.custom.create',
      entity: 'Match', entityId: m.id,
      payload: { label: input.label, countsForStandings: input.countsForStandings },
    });
    return m;
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tournament/schedule-service.test.ts --project unit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/schedule-service.ts src/lib/tournament/schedule-service.test.ts
git commit -m "feat(tournament): custom match creation (tiebreaker/exhibition)"
```

---

### Task 10: SSE bus + 公开读模型

**Files:**
- Create: `src/server/tournament-bus.ts`
- Create: `src/lib/tournament/read-model.ts`

- [ ] **Step 1: 写 `src/server/tournament-bus.ts`**（完全镜像 draft-bus）

```ts
import { EventEmitter } from 'node:events';

type ChannelEvent = { type: 'tournament.invalidated' };

const GLOBAL_KEY = '__lol_tournament_bus__';
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;

if (!g[GLOBAL_KEY]) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  g[GLOBAL_KEY] = emitter;
}

const bus = g[GLOBAL_KEY] as EventEmitter;

export function publishTournament(event: ChannelEvent): void {
  bus.emit('event', event);
}

export function subscribeTournament(handler: (event: ChannelEvent) => void): () => void {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
```

- [ ] **Step 2: 写 `src/lib/tournament/read-model.ts`**（公开页一次性聚合查询）

```ts
import { computeStandings } from './standings';
import { buildBracket } from './bracket';
import type { Db } from './types';

/** 公开页完整读模型：赛程 + 各组积分榜 + 对阵树。null = 无赛事 */
export async function getPublicTournamentState(db: Db, seasonId: string) {
  const t = await db.tournament.findUnique({
    where: { seasonId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          groups: {
            orderBy: { name: 'asc' },
            include: { teams: { include: { team: { select: { id: true, name: true } } } } },
          },
        },
      },
      matches: {
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!t) return null;

  const groupStage = t.stages.find((s) => s.type === 'GROUP');
  const standings = (groupStage?.groups ?? []).map((g) => ({
    groupId: g.id,
    name: g.name,
    teams: Object.fromEntries(g.teams.map((x) => [x.team.id, x.team.name])),
    rows: computeStandings(
      g.teams.map((x) => x.team.id),
      t.matches
        .filter((m) => m.groupId === g.id)
        .map((m) => ({
          teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
          status: m.status, countsForStandings: m.countsForStandings,
        })),
    ),
  }));

  const bracket = buildBracket(
    t.matches
      .filter((m) => m.roundKey !== null)
      .map((m) => ({
        id: m.id, roundKey: m.roundKey, label: m.label,
        teamAId: m.teamAId, teamBId: m.teamBId,
        winnerTeamId: m.winnerTeamId, status: m.status,
      })),
  );

  return {
    tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status },
    matches: t.matches.map((m) => ({
      id: m.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status, isWalkover: m.isWalkover,
      teamA: m.teamA, teamB: m.teamB, winnerTeamId: m.winnerTeamId,
      groupId: m.groupId, version: m.version,
    })),
    standings,
    bracket,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/tournament-bus.ts src/lib/tournament/read-model.ts
git commit -m "feat(tournament): SSE bus and public read model"
```

---

### Task 11: API 路由（admin 写 + public 读/SSE）+ middleware

**Files:**
- Create: `src/lib/tournament/route-errors.ts`
- Create: `src/app/api/tournament/admin/route.ts`（POST 创建 / DELETE 删除）
- Create: `src/app/api/tournament/admin/groups/route.ts`（PUT 分组 / POST 确认）
- Create: `src/app/api/tournament/admin/close-groups/route.ts`（POST 收小组）
- Create: `src/app/api/tournament/admin/matches/[id]/route.ts`（PATCH 排期/取消 / POST 录局 / DELETE 删局）
- Create: `src/app/api/tournament/admin/matches/[id]/walkover/route.ts`（POST）
- Create: `src/app/api/tournament/public/state/route.ts`（GET）
- Create: `src/app/api/tournament/public/stream/route.ts`（GET SSE）
- Modify: `src/middleware.ts:5` 与 `:17` 附近（PUBLIC_PREFIXES / API 放行）

- [ ] **Step 1: 写 `route-errors.ts`（TournamentError → HTTP）**

```ts
import { NextResponse } from 'next/server';
import { TournamentError } from './errors';

const STATUS: Record<string, number> = {
  SEASON_NOT_FOUND: 404,
  TOURNAMENT_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  TOURNAMENT_EXISTS: 409,
  VERSION_CONFLICT: 409,
  DOWNSTREAM_RECORDED: 409,
  STANDINGS_TIED: 409,
  INVALID_STATE: 422,
  INVALID_CONFIG: 422,
  TEAM_NOT_IN_SEASON: 422,
  VALIDATION: 422,
};

export function toResponse(err: unknown): NextResponse {
  if (err instanceof TournamentError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: STATUS[err.code] ?? 400 },
    );
  }
  console.error('[tournament] unexpected', err);
  return NextResponse.json({ error: '服务器错误' }, { status: 500 });
}
```

- [ ] **Step 2: 写 admin 路由**。模式统一：requireAdmin → Zod parse → service → `publishTournament` → 200。代表实现（`matches/[id]/route.ts`，其余路由同构）：

```ts
// src/app/api/tournament/admin/matches/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { db } from '@/lib/db';
import { cancelMatch, deleteGame, recordGame, rescheduleMatch } from '@/lib/tournament/score-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const patchSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reschedule'), expectedVersion: z.number().int(), scheduledAt: z.string().datetime().nullable() }),
  z.object({ op: z.literal('cancel'), expectedVersion: z.number().int() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = patchSchema.parse(await req.json());
    if (body.op === 'reschedule') {
      await rescheduleMatch(db, {
        matchId: id, expectedVersion: body.expectedVersion,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        actorUserId: guard.session.user.id,
      });
    } else {
      await cancelMatch(db, { matchId: id, expectedVersion: body.expectedVersion, actorUserId: guard.session.user.id });
    }
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const recordSchema = z.object({ expectedVersion: z.number().int(), winnerTeamId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = recordSchema.parse(await req.json());
    await recordGame(db, { matchId: id, ...body, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const deleteSchema = z.object({ expectedVersion: z.number().int(), gameId: z.string().min(1) });

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = deleteSchema.parse(await req.json());
    await deleteGame(db, { matchId: id, ...body, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
```

其余 admin 路由按同一骨架，替换 Zod schema 与 service 调用：
- `admin/route.ts`：`POST` body `{ seasonId, name, teamIds: string[], config }` → `createTournament`；`DELETE` body `{ tournamentId }` → `deleteTournament`。config 用 `z.object({...}).passthrough()` 透传，最终合法性由 `groupKnockout.validate` 把关。
- `admin/groups/route.ts`：`PUT` body `{ tournamentId, assignments: [{groupId, teamIds}] }` → `assignGroups`；`POST` body `{ tournamentId }` → `confirmGroups`。
- `admin/close-groups/route.ts`：`POST` body `{ tournamentId }` → `closeGroupStage`。
- `admin/matches/[id]/walkover/route.ts`：`POST` body `{ expectedVersion, winnerTeamId }` → `setWalkover`。
- `admin/matches/route.ts`：`POST` body `{ tournamentId, groupId, teamAId, teamBId, bestOf, label, countsForStandings, scheduledAt? }` → `addCustomMatch`（Task 9b）。

> session.user 的字段形状（`id` 等）以 `src/lib/auth.ts` 现有定义为准。

- [ ] **Step 3: 写 public 路由**

```ts
// src/app/api/tournament/public/state/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getPublicTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(db);
  if (!season) return NextResponse.json({ state: null });
  const state = await getPublicTournamentState(db, season.id);
  return NextResponse.json({ state });
}
```

```ts
// src/app/api/tournament/public/stream/route.ts
// SSE 写法先对照现有 /api/draft 或 /api/live 的 stream 路由，保持一致；以下为骨架
import { subscribeTournament } from '@/server/tournament-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: 'connected' });
      const unsubscribe = subscribeTournament((e) => send(e));
      const ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 25000);
      cleanup = () => { unsubscribe(); clearInterval(ping); };
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
```

- [ ] **Step 4: middleware 放行公开路由**

`src/middleware.ts:5`：

```ts
const PUBLIC_PREFIXES = ['/login', '/access-denied', '/register', '/live', '/tournament'];
```

API 放行段（`src/middleware.ts:17` 附近，与 `/api/live` 并列）加：

```ts
    pathname.startsWith('/api/tournament/public') ||
```

- [ ] **Step 5: 类型与 lint 检查**

Run: `npm run typecheck && npx next lint --dir src/app/api/tournament`
Expected: 无 error。

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tournament src/lib/tournament/route-errors.ts src/middleware.ts
git commit -m "feat(tournament): admin/public API routes, SSE stream, public prefixes"
```

---

### Task 12: 集成测试 — 全流程冠军之路

**Files:**
- Test: `src/lib/tournament/integration.test.ts`

- [ ] **Step 1: 写测试（建赛事 → 分组 → 确认 → 录完小组 → 收组 → 录完淘汰 → 冠军 + 读模型校验）**

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { getPublicTournamentState } from './read-model';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

it('全流程：8 队 2 组出 4 强 → SF → FINAL → 冠军', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'S1', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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

  // 小组赛：下标小者胜
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });

  // 淘汰赛：teamA 全胜打满
  for (const roundKey of ['SF', 'FINAL']) {
    for (const m of await testDb.match.findMany({ where: { roundKey } })) {
      let fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      const need = Math.ceil(fresh.bestOf / 2);
      for (let w = 0; w < need; w++) {
        await recordGame(testDb, {
          matchId: m.id, expectedVersion: fresh.version, winnerTeamId: fresh.teamAId!, actorUserId: 'u',
        });
        fresh = (await testDb.match.findUnique({ where: { id: m.id } }))!;
      }
      expect(fresh.status).toBe('FINISHED');
    }
  }

  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  expect(final.winnerTeamId).toBe(final.teamAId);

  // 读模型完整性
  const state = (await getPublicTournamentState(testDb, seasonId))!;
  expect(state.matches.length).toBe(12 + 3);
  expect(state.standings).toHaveLength(2);
  expect(state.bracket.map((r) => r.roundKey)).toEqual(['SF', 'FINAL']);
});
```

- [ ] **Step 2: 跑通**

Run: `npx vitest run src/lib/tournament/integration.test.ts --project unit`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament/integration.test.ts
git commit -m "test(tournament): end-to-end champion path integration test"
```

---

### Task 13: 公开页 `/tournament`（赛程 + 小组 + 对阵图，SSE 自动刷新）

**Files:**
- Create: `src/hooks/useTournamentState.ts`
- Create: `src/app/tournament/layout.tsx`
- Create: `src/app/tournament/page.tsx`
- Create: `src/components/tournament/PublicTournamentView.tsx`
- Create: `src/components/tournament/ScheduleList.tsx`
- Create: `src/components/tournament/GroupStandings.tsx`
- Create: `src/components/tournament/BracketView.tsx`

- [ ] **Step 1: `useTournamentState.ts`** —— 挂载时拉 state，订阅 SSE 失效信号后重拉：

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export type PublicState = {
  tournament: { id: string; name: string; kind: string; status: string };
  matches: Array<{
    id: string; label: string | null; roundKey: string | null; bestOf: number;
    scheduledAt: string | null; status: string; isWalkover: boolean;
    teamA: { id: string; name: string } | null; teamB: { id: string; name: string } | null;
    winnerTeamId: string | null; groupId: string | null; version: number;
  }>;
  standings: Array<{
    groupId: string; name: string;
    teams: Record<string, string>;
    rows: Array<{ teamId: string; played: number; wins: number; losses: number; points: number; rank: number; tied: boolean }>;
  }>;
  bracket: Array<{ roundKey: string; matches: Array<{ id: string; label: string | null; teamAId: string | null; teamBId: string | null; winnerTeamId: string | null; status: string }> }>;
} | null;

export function useTournamentState() {
  const [state, setState] = useState<PublicState>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch('/api/tournament/public/state');
    const body = await res.json().catch(() => ({ state: null }));
    setState(body.state ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
    const es = new EventSource('/api/tournament/public/stream');
    es.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data).type === 'tournament.invalidated') void refetch();
      } catch {
        /* 忽略心跳/坏帧 */
      }
    };
    return () => es.close();
  }, [refetch]);

  return { state, loaded, refetch };
}
```

- [ ] **Step 2: 页面与组件**。`page.tsx` 渲染 client 组件 `PublicTournamentView`（内部 `Tabs`：赛程 / 小组赛 / 对阵图）。三个子组件均为纯展示，样式对照 `src/components/draft/` 现有组件保持一致（`text-muted-foreground`、`border rounded-md`、`Badge`）：
  - `ScheduleList`：按 `scheduledAt` 日期分组（null 归"时间待定"），每行：时间（`toLocaleString('zh-CN')`）、`label`、`teamA?.name ?? '待定'` vs `teamB?.name ?? '待定'`、状态徽章（FINISHED 显示胜方名 + "胜"；WALKOVER 显示"轮空"；CANCELED 划线"已取消"；SCHEDULED 显示 BO 数）。
  - `GroupStandings`：每组一张表（列：排名/队伍/场次/胜/负/积分），`tied` 行加 `bg-amber-500/10` 并注"并列待加赛"；队名从 `teams` 映射取。
  - `BracketView`：`flex gap-8 overflow-x-auto`，每轮一列（列头 = roundKey 中文名），每场一张卡片：两行队名（`teamAId` 经 standings.teams 或 matches 中的队名映射解析；空位显示"待定"），胜者行 `font-bold text-primary`。M1 不画连接线。
  - `layout.tsx`：极简公开布局（`<div className="min-h-screen bg-background"><header>赛事名 + kind 类型 Badge</header><main>{children}</main></div>`），不依赖登录态。
  - `PublicTournamentView`：`loaded && !state` 时显示空态"本赛季暂未创建赛事"。

- [ ] **Step 3: 手动验收**

Run: `npm run dev`，无痕窗口（未登录）开 `http://localhost:3000/tournament`。
Expected: 无赛事显示空态，不跳登录页；造数后三个 Tab 正常渲染。

- [ ] **Step 4: Commit**

```bash
git add src/app/tournament src/components/tournament src/hooks/useTournamentState.ts
git commit -m "feat(tournament): public schedule/standings/bracket pages with SSE"
```

---

### Task 14: 管理端 `/admin/tournament`（M1：设置/分组/赛程/简化录比分）

**Files:**
- Create: `src/app/admin/tournament/page.tsx`
- Create: `src/components/admin/tournament/TournamentAdmin.tsx`
- Create: `src/components/admin/tournament/SetupTab.tsx`
- Create: `src/components/admin/tournament/GroupsTab.tsx`
- Create: `src/components/admin/tournament/ScheduleTab.tsx`
- Create: `src/components/admin/tournament/ScoreDialog.tsx`
- Modify: `src/components/layout/AppSidebar.tsx`（加"赛事"导航项，照现有项写法）

实现要点（复用 `Dialog`/`Button`/`Tabs`/`Select`/`Checkbox`/`sonner` 现有组件；数据获取复用 `useTournamentState`）：

- [ ] **Step 1: `page.tsx`** —— server component，权限模式照抄 `src/app/admin/` 下现有页面（admin layout 已做 ADMIN 校验）；服务端取活跃赛季 + 该赛季全部 Team（id、name）传给 `TournamentAdmin`。无活跃赛季显示提示。

- [ ] **Step 2: `SetupTab`** —— 无赛事：表单（赛事名 text；**类型 Select：正赛/娱乐赛/海斗/自定义——选"自定义"时显示文本输入，提交值即 `kind` 字符串**；组数/每组队数/每组出线数 number；小组 BO Select(1/3/5)；各轮 BO：根据出线总数动态渲染轮次行；参赛队 Checkbox 列表）。提交前客户端校验：勾选队数 = 组数×每组队数、出线总数为 2 的幂，不满足则禁用提交并红字提示。`POST /api/tournament/admin`，失败 toast `body.error`。有赛事：配置摘要（JSON 字段逐行）+ 危险区"删除赛事"按钮（两次 `confirm()`，第二次要求与赛事名一致的输入）→ `DELETE`。

- [ ] **Step 3: `GroupsTab`** —— M1 用 Select 而非拖拽：每组一个卡片，`teamsPerGroup` 个 `Select`（选项 = 尚未被任何组选走的队）；"随机分组"按钮（Fisher-Yates 洗牌填满）；"保存分组"→ `PUT /api/tournament/admin/groups`；"确认分组并生成对阵"→ 先 PUT 再 `POST /api/tournament/admin/groups`，成功后 toast + refetch。状态非 SETUP 时整个 Tab 只读展示分组结果。

- [ ] **Step 4: `ScheduleTab`** —— 比赛表格（列：阶段/组别或轮次/对阵双方/时间/状态/操作）。时间列：`<input type="datetime-local">`，onBlur 且值变化时 `PATCH {op:'reschedule', expectedVersion, scheduledAt}`；操作列：录比分（开 ScoreDialog）、轮空（弹确认选胜方）、取消（confirm）。GROUP_STAGE 且小组赛全部非 SCHEDULED 时显示"收小组进淘汰赛"→ `POST close-groups`；返回 409 STANDINGS_TIED 时 toast 提示具体组并列、需安排加赛。表格上方「+ 自定义比赛」按钮：Dialog 表单（所属小组 Select 可空 / 双方 Select / BO / 名称 / 是否计分 Checkbox）→ `POST /api/tournament/admin/matches`。

- [ ] **Step 5: `ScoreDialog`** —— 简化录入：标题 = 对阵双方；已录局列表（第 N 局 / 胜方名 / 删除小按钮 → `DELETE`）；底部两个大按钮"`teamA.name` 胜" / "`teamB.name` 胜" → `POST`。每次写带当前 `expectedVersion`，409 时 toast"该比赛已被修改，已刷新"并 refetch 后保持 Dialog 打开。Match FINISHED 时顶部 Badge "已结束 · 胜者 X"，继续录入即改判（接口会校验下游）。

- [ ] **Step 6: 手动验收（完整闭环）**

Run: `npm run dev`，admin 登录走完：创建赛事（2×4×2）→ 分组 → 确认 → 录 12 场小组赛 → 收小组 → 录 SF/FINAL → 决出冠军；同时开未登录窗口看 `/tournament` 实时跟变。
Expected: 全流程无报错；公开页每次录入后 1 秒内自动刷新。

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/tournament src/components/admin/tournament src/components/layout/AppSidebar.tsx
git commit -m "feat(tournament): admin console — setup, groups, schedule, simple scoring"
```

---

### Task 15: 收尾 — 全量回归 + 构建

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（含原有 draft/season/teams 测试）。

- [ ] **Step 2: 类型与构建**

Run: `npm run typecheck && npm run build`
Expected: exit 0。注意本项目 lint error 会让 build 失败（先例：装饰性 `//` 文本要写 `{'//'}`，指向 API 路由的 `<a>` 需要行内 eslint-disable —— 见 commit a8aabf7）。

- [ ] **Step 3: 收尾修补 commit（如有）**

```bash
git add -A && git commit -m "chore(tournament): M1 wrap-up fixes"
```

**M1 完成定义（DoD）**：集成测试冠军之路通过；管理端走完全流程；公开页免登录可看且 SSE 实时刷新；`npm run build` 通过。
