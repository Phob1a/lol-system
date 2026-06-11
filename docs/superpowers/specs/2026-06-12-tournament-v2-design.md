# Tournament System v2 Design（赛事系统重构版）

**Status:** Approved (brainstorming) — rev.2 (incorporated codex review)
**Date:** 2026-06-12
**Author:** 代立轩 (with Claude; reviewed by codex)
**Supersedes:** `2026-05-11-tournament-design.md`（旧版基于事件溯源、单赛事全局唯一、固定 8 强；本版完全重构，旧 `feat/tournament-system` 分支不再合并）

---

## 1. 目标与非目标

### 目标
- 赛事挂在赛季下：每个 Season 至多一个 Tournament，与多赛季体系兼容。
- v1 赛制模板：「小组赛（BO1 单循环积分）+ 单败淘汰」。参数可配：组数、每组队数、每组出线数；出线总数必须是 2 的幂（4/8/16 均可，不写死 8 强）。每个阶段可独立配置 BO1/BO3/BO5。
- 模板机制可扩展：模板逻辑独立成模块并带生命周期 hook，后续新增模板（双败、瑞士轮等）不改动核心代码。
- 手动补充：管理员可在任意阶段下添加自定义比赛（加赛、表演赛），是否计入积分由比赛上的显式开关决定。
- 管理员能力：安排每场比赛日期时间、按局录入比分与数据、轮空、改判、删除重录。
- 每局（Game）记录：胜方、阵营（蓝/红方）、时长、MVP、双方 BP（ban/pick 英雄及顺序）、每位选手的英雄/K/D/A/补刀/伤害/金币。
- 英雄数据内置：打包 Riot Data Dragon 静态英雄表（中文名 + 图标）进仓库，录入用搜索下拉，不依赖外部 API。
- 公开页面（免登录）：赛程表、小组积分榜、淘汰赛对阵图、比赛详情（BP + 选手数据）、赛事数据榜。SSE 实时刷新。
- 轻量审计：所有写操作记录 AuditLog（只读，不支持重放/撤销）。

### 非目标（v1）
- 双败、瑞士轮等其他赛制模板（架构预留：晋级边模型 + 模板 hook，不实现）。
- 队长自助报分（录入仍为管理员专属）。
- 第三名决定战。
- 对局 API 自动抓取数据（全部手动录入）。
- 推送通知、VOD/截图附件。
- 事件溯源与操作撤销（改判 = 直接编辑记录，AuditLog 仅记录痕迹）。

---

## 2. 需求决策记录

| 维度 | 决策 |
|---|---|
| 与赛季关系 | `Tournament.seasonId` 唯一，一赛季一赛事；赛季归档则赛事只读 |
| 赛制 | A3 模式：模板化 + 手动加自定义比赛；v1 仅「小组赛+单败淘汰」模板 |
| 出线规模 | `groupCount × advancingPerGroup` 必须为 2 的幂（≥2），不固定 8 |
| 每阶段局数 | GROUP/KNOCKOUT 各阶段独立配 BO1/BO3/BO5（淘汰赛可按轮次细分，如 QF=BO3、决赛=BO5） |
| 小组积分 | 胜 1 分负 0 分；并列先比头对头小子表；仍并列界面提示，管理员加计分加赛解决 |
| 局级数据 | 胜负 + 阵营 + 时长 + MVP + BP + 选手六项（英雄/K/D/A/补刀/伤害/金币） |
| 英雄来源 | 内置 Data Dragon 静态表（仓库内 JSON + 图标 CDN/本地兜底） |
| 架构 | 方案三：CRUD + 派生计算 + 轻量审计日志（明确放弃事件溯源） |
| **结果权威（rev.2）** | **`Match.status/winnerTeamId` 是物化的系列赛结果，由 score-service 独占维护**：非草稿 Game 达到 BO 阈值 → 结算；删局/改局/轮空全部经 score-service 重算并维护不变量。积分榜/对阵图从 Match 派生，数据榜从 Game 派生，两者各有单一权威源 |
| **晋级模型（rev.2）** | 独立晋级边表 `MatchAdvancementEdge(fromMatch → toMatch, outcome, slot)`，v1 只生成 WINNER 边；LOSER 边留给双败。建边时校验同 tournament + 无环 |
| **赛事阵容快照（rev.2）** | 创建赛事时把各队名单快照进 `TournamentTeamPlayer`；选手数据录入校验对快照而非可变的 TeamSlot；快照可由管理员显式修改（审计） |
| **关系完整性（rev.2）** | 所有 teamId/registrationId 外键建显式 Prisma relation；service 层强校验：team ∈ tournament.season、registration ∈ 对应队伍快照、winner ∈ {teamA, teamB} |
| 并发控制 | `Match.version` 作为整场编辑锁：局/BP/选手数据所有写操作都带 `expectedVersion`，不匹配返 409 |
| 权限 | 写 = ADMIN；读 = 公开免登录（沿用 middleware `PUBLIC_PREFIXES` 机制） |
| 实时 | 公开页 SSE 自动刷新（独立 tournament-bus；v1 只广播"状态已变"，前端重拉） |

---

## 3. 数据模型（Prisma 新增）

### 枚举

```prisma
enum StageType        { GROUP KNOCKOUT CUSTOM }
enum MatchStatus      { SCHEDULED FINISHED WALKOVER CANCELED }
enum MatchSource      { GENERATED CUSTOM }
enum AdvanceOutcome   { WINNER LOSER }        // v1 仅用 WINNER
enum BanPickType      { BAN PICK }
enum TournamentStatus { SETUP GROUP_STAGE KNOCKOUT FINISHED }
```

### 模型（实施时全部建显式 relation；关键索引见本节末）

```prisma
model Tournament {
  id        String  @id @default(cuid())
  seasonId  String  @unique          // 一赛季一赛事
  name      String
  status    TournamentStatus @default(SETUP)
  config    Json                     // 模板参数快照：{ template, groupCount, teamsPerGroup, advancingPerGroup, groupBestOf, knockoutBestOf: {qf,sf,final}… }
  stages    TournamentStage[]
  teams     TournamentTeam[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// —— 赛事阵容快照（rev.2）——
model TournamentTeam {
  id           String @id @default(cuid())
  tournamentId String
  teamId       String                // → Team（同 season，service 校验）
  players      TournamentTeamPlayer[]
  @@unique([tournamentId, teamId])
}

model TournamentTeamPlayer {
  tournamentTeamId String
  registrationId   String            // → Registration（创建赛事时从 TeamSlot 快照）
  @@id([tournamentTeamId, registrationId])
}

model TournamentStage {
  id           String    @id @default(cuid())
  tournamentId String
  type         StageType
  name         String                // "小组赛" / "淘汰赛" / 自定义名
  order        Int
  bestOf       Int                   // 默认局数；淘汰赛轮次差异存 config
  config       Json?
  groups       TournamentGroup[]
  matches      Match[]
}

model TournamentGroup {
  id      String @id @default(cuid())
  stageId String
  name    String                     // "A" / "B" …
  teams   TournamentGroupTeam[]
  matches Match[]
}

model TournamentGroupTeam {
  groupId String
  teamId  String                     // → Team
  @@id([groupId, teamId])
}

model Match {
  id                 String      @id @default(cuid())
  tournamentId       String
  stageId            String
  groupId            String?
  label              String?            // "QF1" / "半决赛2" / 自定义
  roundKey           String?            // QF / SF / FINAL / R16 …
  bestOf             Int
  source             MatchSource @default(GENERATED)
  countsForStandings Boolean     @default(true)   // CUSTOM 加赛是否计积分由它决定
  teamAId            String?            // 淘汰赛未定位时为空
  teamBId            String?
  scheduledAt        DateTime?
  status             MatchStatus @default(SCHEDULED)
  winnerTeamId       String?            // 物化系列赛结果，score-service 独占维护
  isWalkover         Boolean     @default(false)
  note               String?
  version            Int         @default(0)      // 整场编辑锁：局/BP/数据写操作均带 expectedVersion
  games              Game[]
  outEdges           MatchAdvancementEdge[] @relation("FromMatch")
  inEdges            MatchAdvancementEdge[] @relation("ToMatch")
}

// —— 晋级边（rev.2，取代 nextMatchId/nextSlot 内联字段）——
model MatchAdvancementEdge {
  id          String         @id @default(cuid())
  fromMatchId String
  toMatchId   String
  outcome     AdvanceOutcome // v1 全部 WINNER；双败用 LOSER
  slot        String         // "A" | "B"
  @@unique([toMatchId, slot])            // 一个目标位只能被一条边填
  @@unique([fromMatchId, outcome])       // 一场比赛的某种结果只有一个去向
}

model Game {
  id                String  @id @default(cuid())
  matchId           String
  index             Int                 // 第几局，1 起
  isDraft           Boolean @default(true) // 草稿局；系列赛结算只统计非草稿局
  blueTeamId        String?             // 本局蓝方（阵营随局交换）；置非草稿时必填
  winnerTeamId      String?             // 草稿期可空；置非草稿时必填（service 校验 ∈ {teamA,teamB}）
  durationSeconds   Int?
  mvpRegistrationId String?             // → Registration ∈ 该局参战名单
  bans              GameBanPick[]
  playerStats       GamePlayerStat[]
  @@unique([matchId, index])
}

model GameBanPick {
  id         String      @id @default(cuid())
  gameId     String
  teamId     String
  type       BanPickType
  championId String                    // Data Dragon key，如 "Ahri"
  order      Int                       // 全局 BP 顺序
  @@unique([gameId, order])            // 顺序不可重复
  @@unique([gameId, championId])       // 同局英雄不可重复（标准征召）
}

model GamePlayerStat {
  id             String @id @default(cuid())
  gameId         String
  teamId         String
  registrationId String                // → Registration ∈ 该队 TournamentTeamPlayer 快照
  championId     String
  kills          Int
  deaths         Int
  assists        Int
  cs             Int
  damage         Int
  gold           Int
  @@unique([gameId, registrationId])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String                    // "match.score.record" / "match.reschedule" …
  entity    String                    // "Match" / "Game" …
  entityId  String
  payload   Json?                     // 变更摘要（before/after 关键字段）
  createdAt DateTime @default(now())
}
```

**关键索引**（建表时一并建，不留到临场）：
- `Match`: `@@index([tournamentId, scheduledAt])`、`@@index([stageId])`、`@@index([groupId])`（公开赛程页/分组页查询）
- `Game`: `@@index([matchId])`
- `GamePlayerStat`: `@@index([registrationId])`、`@@index([championId])`（数据榜聚合）
- `GameBanPick`: `@@index([gameId])`
- `AuditLog`: `@@index([entity, entityId])`、`@@index([createdAt])`

**删除关系**：Tournament 及以下全链 `onDelete: Cascade`；Team/Registration 被引用处 `Restrict`（赛事存在时不许删队伍/报名）。

---

## 4. 模块架构

```
src/
├── lib/tournament/
│   ├── templates/
│   │   ├── types.ts               # 模板接口（见下）
│   │   └── group-knockout.ts      # v1 唯一模板实现
│   ├── tournament-service.ts      # 创建（含阵容快照）/状态流转/删除
│   ├── schedule-service.ts        # 排期、自定义比赛增删
│   ├── score-service.ts           # 结果权威：录局/改局/删局/轮空/改判 → 重算 Match 物化结果 + 沿晋级边流转
│   ├── standings.ts               # 纯函数：Match 集合 → 积分榜（头对头、并列检测）
│   ├── leaderboard.ts             # 纯函数：Game 集合 → 选手数据榜
│   ├── bracket.ts                 # 纯函数：Match + Edge 集合 → 对阵树视图模型
│   └── audit.ts                   # writeAudit(tx, …) 统一入口
├── server/tournament-bus.ts       # SSE 广播（独立 EventEmitter；只广播失效信号）
├── data/champions.json            # Data Dragon 静态英雄表（构建脚本生成）
├── app/api/tournament/
│   ├── admin/…                    # requireAdmin + Zod → service
│   └── public/…                   # 只读聚合查询 + SSE stream
├── app/admin/tournament/          # 管理端 5 Tab
└── app/tournament/                # 公开页
```

**模板接口**（rev.2，带生命周期 hook，核心只调接口不理解具体赛制）：

```ts
interface TournamentTemplate {
  validate(config): Result            // 参数合法性（2 的幂、队数匹配…）
  generate(teams, config): Skeleton   // 阶段/分组/对阵/晋级边骨架
  // 可选 hook，v1 的 group-knockout 不需要，双败/瑞士轮用：
  onMatchSettled?(ctx): Action[]      // 一场结束后触发（瑞士轮动态配对等）
  generateNextRound?(ctx): Skeleton   // 动态生成下一轮
}
```

**边界约定**：
- service 层纯函数化（入参含 `db`/`tx`），不 import Next/NextAuth，可独立单测。
- 所有写操作在单事务内完成业务变更 + AuditLog 写入；bus 广播在事务提交后。
- **结果不变量由 score-service 独占维护**：任何 Game 写操作（录/改/删/草稿转正/轮空）之后，在同事务内重算所属 Match 的 `status/winnerTeamId`，并沿 `MatchAdvancementEdge` 流转或回收下游队伍位。其他模块禁止直接写 Match 结果字段。
- **跨赛季一致性校验**（service 层统一函数）：team ∈ tournament.season；registration ∈ 该队 `TournamentTeamPlayer` 快照；winner/blueTeam ∈ {teamA, teamB}；MVP ∈ 该局 10 人。
- `standings/leaderboard/bracket` 是无副作用派生计算，读接口现场调用。

---

## 5. 页面设计

### 管理端 `/admin/tournament`（5 Tab）
1. **设置**：选模板（v1 仅一个）→ 填参数 → 校验 → 勾选参赛队伍 → 生成骨架并**快照各队名单**。FINISHED 前可整体重置（二次确认，连带删除全部比赛数据，审计记录）。名单快照可在此 Tab 修改（如替补顶上，审计记录）。
2. **分组**：拖拽分队（或随机分组）→ 确认后生成组内单循环对阵。
3. **赛程**：比赛列表（按阶段/组/日期筛选）；行内编辑 `scheduledAt`；「+ 自定义比赛」选所属阶段/组、两队、BO 数、**是否计入积分**。
4. **录比分**：按局推进——每局：阵营（哪队蓝方）→ 胜方 → 时长 → BP（按顺序点选 ban/pick，英雄搜索下拉带头像）→ 双方 10 人数据表格 → MVP。局存草稿，字段齐才转正；非草稿局达 BO 阈值自动结算并沿晋级边流转。轮空一键处理。改判 = 重开编辑，下游按级联规则处理。所有写操作带 `Match.version`。
5. **操作记录**：AuditLog 倒序列表。

### 公开页 `/tournament`（免登录 + SSE）
- **赛程**：按日期分组列表——时间、阶段标签、两队、比分/状态，点击进详情。
- **小组赛**：每组积分榜（场次/胜/负/积分，头对头并列高亮）+ 组内对阵网格。
- **对阵图**：淘汰赛树状 bracket（由 Match + Edge 派生），胜者高亮 + 晋级连线，未定位次显示占位（"A组第1"）。
- **比赛详情** `/tournament/match/[id]`：逐局 Tab——蓝红方标识、BP 时间线（带英雄头像）、10 人数据对比表、时长、MVP 徽章。
- **数据榜**：选手聚合排行——场均 K/D/A、KDA 比、场均补刀/伤害/金币、MVP 次数；可按字段排序。

middleware：`/tournament`、`/api/tournament/public` 加入 `PUBLIC_PREFIXES`。

---

## 6. 错误处理与边界情况

- **并发**：`Match.version` 整场编辑锁；局/BP/选手数据所有写操作带 `expectedVersion`，不匹配返 409 提示刷新。
- **改判级联**：淘汰赛改判清空下游已填入的队伍位；若下游已录任何 Game（含草稿）则拒绝改判，提示先删除下游记录（防静默丢数据）。
- **统计语义（rev.2 写死）**：
  - `WALKOVER`：计入积分榜（胜方 1 分）与队伍胜负；**不**产生 Game，**不**计入选手数据榜与场次。
  - `CANCELED`：公开页展示（划线样式），**不**计入积分榜、不计入任何统计。
  - **删局回退**：删除 Game 使非草稿局数跌破 BO 阈值时，Match 自动从 FINISHED 回退为 SCHEDULED，并按改判级联规则处理下游（下游已录则先拒绝）。
  - `countsForStandings=false` 的比赛：展示但不进积分榜；其 Game 数据**计入**选手数据榜（表演赛可配置，默认计入，实施时以 spec 评审为准——定为计入）。
- **删除保护**：赛事进行中不允许删除参赛 Team（DB Restrict + 接口校验）；删除整个赛事需 status=SETUP 或二次确认短语。
- **数据校验**：Zod 端到端——K/D/A/补刀/伤害/金币非负整数；时长 0–120 分钟；BP 同局英雄/顺序唯一（DB unique 兜底）；MVP/选手 ∈ 该局参战名单；blueTeam/winner ∈ {teamA, teamB}。
- **赛季归档**：Season.archivedAt 非空时所有写接口 403，公开页仍可浏览。

---

## 7. 测试策略

- **服务层单测**（vitest + 现有 DB 测试基建）：
  - 模板生成：参数组合 → 阶段/分组/对阵/晋级边数量与连线正确（4/8/16 出线规模；edge 无环、目标位唯一）。
  - standings：积分、头对头子表、三队连环并列检测；WALKOVER/CANCELED/countsForStandings 语义。
  - 结果权威：录局/删局/草稿转正/轮空 → Match 物化结果重算正确；删局跌破阈值回退；下游已录拒绝改判。
  - 晋级流转：胜者沿 WINNER 边填位、改判级联清空。
  - 跨赛季校验：异 season 的 team/registration 一律拒绝。
- **API 集成测试**：全流程（建赛事→快照→分组→排期→录局→晋级→冠军）、权限（非 admin 写 403、公开读免登录）、并发 409。
- **派生计算纯函数**：standings/leaderboard/bracket 喂内存数据测，无 DB。

---

## 8. 交付里程碑

1. **M1 — 能排能用**：数据模型迁移（含快照表、晋级边表）、模板生成、分组、排期、简单胜负录入（无 BP/选手数据）、公开赛程页 + 积分榜 + 对阵图、SSE。
2. **M2 — 数据完整**：BP 录入、选手数据表格、MVP、阵营标识、比赛详情页、英雄静态数据管线。
3. **M3 — 收尾**：数据榜、审计页、改判级联完善、移动端适配与打磨。

每个里程碑结束时可独立部署使用。

---

## 附：rev.2 修订记录（codex review 采纳情况）

| 反馈 | 处理 |
|---|---|
| 严重1 结果 source of truth 不清 | 采纳：Match 结果定为物化状态，score-service 独占维护不变量（§2/§4/§6） |
| 严重2 nextMatchId 不安全/不支撑双败 | 采纳：抽成 `MatchAdvancementEdge` 表 + 双 unique 约束 + 无环校验（§3） |
| 严重3 缺阵容快照 | 采纳：新增 `TournamentTeam(Player)` 快照表，录入校验对快照（§3/§5） |
| 严重4 跨赛季一致性 | 采纳：显式 relation + service 统一校验函数（§3/§4） |
| 建议1 模板生命周期 hook | 采纳：接口预留 `onMatchSettled/generateNextRound`（§4） |
| 建议2 自定义比赛语义 | 采纳：`Match.source` + `countsForStandings`（§3/§6） |
| 建议3 BP 约束/阵营 | 采纳：双 unique + `Game.blueTeamId`（§3） |
| 建议4 并发版本 | 采纳：`Match.version` 整场编辑锁（§3/§6） |
| 建议5 轮空/取消语义 | 采纳：统计语义写死（§6） |
| 建议6 索引前置 | 采纳：关键索引清单（§3） |
| 可忽略 1-3 | 与原设计一致，无改动 |
