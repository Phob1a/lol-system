# Tournament System v2 Design（赛事系统重构版）

**Status:** Approved (brainstorming)
**Date:** 2026-06-12
**Author:** 代立轩 (with Claude)
**Supersedes:** `2026-05-11-tournament-design.md`（旧版基于事件溯源、单赛事全局唯一、固定 8 强；本版完全重构，旧 `feat/tournament-system` 分支不再合并）

---

## 1. 目标与非目标

### 目标
- 赛事挂在赛季下：每个 Season 至多一个 Tournament，与多赛季体系兼容。
- v1 赛制模板：「小组赛（BO1 单循环积分）+ 单败淘汰」。参数可配：组数、每组队数、每组出线数；出线总数必须是 2 的幂（4/8/16 均可，不写死 8 强）。每个阶段可独立配置 BO1/BO3/BO5。
- 模板机制可扩展：模板逻辑独立成模块，后续新增模板（双败、瑞士轮等）不改动核心代码。
- 手动补充：管理员可在任意阶段下添加自定义比赛（加赛、表演赛），挂在小组下的自定义比赛计入该组积分。
- 管理员能力：安排每场比赛日期时间、按局录入比分与数据、轮空、改判、删除重录。
- 每局（Game）记录：胜方、时长、MVP、双方 BP（ban/pick 英雄及顺序）、每位选手的英雄/K/D/A/补刀/伤害/金币。
- 英雄数据内置：打包 Riot Data Dragon 静态英雄表（中文名 + 图标）进仓库，录入用搜索下拉，不依赖外部 API。
- 公开页面（免登录）：赛程表、小组积分榜、淘汰赛对阵图、比赛详情（BP + 选手数据）、赛事数据榜。SSE 实时刷新。
- 轻量审计：所有写操作记录 AuditLog（只读，不支持重放/撤销）。

### 非目标（v1）
- 双败、瑞士轮等其他赛制模板（架构预留，不实现）。
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
| 小组积分 | 胜 1 分负 0 分；并列先比头对头小子表；仍并列界面提示，管理员加 CUSTOM 加赛解决 |
| 局级数据 | 胜负 + 时长 + MVP + BP + 选手六项（英雄/K/D/A/补刀/伤害/金币） |
| 英雄来源 | 内置 Data Dragon 静态表（仓库内 JSON + 图标 CDN/本地兜底） |
| 架构 | 方案三：纯 CRUD + 派生计算 + 轻量审计日志（明确放弃事件溯源） |
| 派生原则 | 积分榜、排名、晋级树展示、数据榜全部从 Match/Game 现算，不存冗余状态；唯一的物化点：淘汰赛胜者写入 `nextMatch` 的队伍位，改判时下游自动重算 |
| 权限 | 写 = ADMIN；读 = 公开免登录（沿用 middleware `PUBLIC_PREFIXES` 机制） |
| 实时 | 公开页 SSE 自动刷新（独立 tournament-bus，模式同 draft-bus） |

---

## 3. 数据模型（Prisma 新增）

### 枚举

```prisma
enum StageType        { GROUP KNOCKOUT CUSTOM }
enum MatchStatus      { SCHEDULED FINISHED WALKOVER CANCELED }
enum BanPickType      { BAN PICK }
enum TournamentStatus { SETUP GROUP_STAGE KNOCKOUT FINISHED }
```

### 模型（字段为主干，实施时可补索引）

```prisma
model Tournament {
  id        String  @id @default(cuid())
  seasonId  String  @unique          // 一赛季一赛事
  name      String
  status    TournamentStatus @default(SETUP)
  config    Json                     // 模板参数快照：{ template, groupCount, teamsPerGroup, advancingPerGroup, groupBestOf, knockoutBestOf: {qf,sf,final}… }
  stages    TournamentStage[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model TournamentStage {
  id           String    @id @default(cuid())
  tournamentId String
  type         StageType
  name         String                // "小组赛" / "淘汰赛" / 自定义名
  order        Int                   // 阶段顺序
  bestOf       Int                   // 默认局数（1/3/5）；淘汰赛轮次差异存 config
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
  teamId  String                     // → 现有 Team
  @@id([groupId, teamId])
}

model Match {
  id           String      @id @default(cuid())
  tournamentId String
  stageId      String
  groupId      String?                // GROUP 阶段比赛所属组；CUSTOM 加赛挂组时计积分
  label        String?                // "QF1" / "半决赛2" / 自定义
  roundKey     String?                // 淘汰赛轮次标识：QF/SF/FINAL（或 R16…）
  bestOf       Int
  teamAId      String?                // 淘汰赛未定位时为空
  teamBId      String?
  scheduledAt  DateTime?
  status       MatchStatus @default(SCHEDULED)
  winnerTeamId String?
  isWalkover   Boolean     @default(false)
  note         String?
  nextMatchId  String?                // 胜者晋级去向
  nextSlot     String?                // "A" | "B"
  games        Game[]
}

model Game {
  id              String  @id @default(cuid())
  matchId         String
  index           Int                  // 第几局，1 起
  isDraft         Boolean @default(true) // 草稿局：字段未录齐；系列赛结算只统计非草稿局
  winnerTeamId    String?              // 草稿期可空；置非草稿时必填（服务层校验）
  durationSeconds Int?
  mvpRegistrationId String?            // → Registration
  bans            GameBanPick[]
  playerStats     GamePlayerStat[]
  @@unique([matchId, index])
}

model GameBanPick {
  id         String      @id @default(cuid())
  gameId     String
  teamId     String
  type       BanPickType
  championId String                   // Data Dragon 英雄 key，如 "Ahri"
  order      Int                      // 全局 BP 顺序
}

model GamePlayerStat {
  id             String @id @default(cuid())
  gameId         String
  teamId         String
  registrationId String               // → Registration（赛季内选手身份）
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
  userId    String                   // 操作者
  action    String                   // "match.score.record" / "match.reschedule" …
  entity    String                   // "Match" / "Game" …
  entityId  String
  payload   Json?                    // 变更摘要（before/after 关键字段）
  createdAt DateTime @default(now())
}
```

删除关系：Tournament 及以下全链 `onDelete: Cascade`；Team/Registration 被引用处用 `Restrict`（赛事存在时不许删队伍）。

---

## 4. 模块架构

```
src/
├── lib/tournament/
│   ├── templates/
│   │   ├── types.ts               # TournamentTemplate 接口：validate(config) / generate(teams, config) → stages+matches 骨架
│   │   └── group-knockout.ts      # v1 唯一模板实现
│   ├── tournament-service.ts      # 创建/状态流转/删除
│   ├── schedule-service.ts        # 排期、自定义比赛增删
│   ├── score-service.ts           # 录局（含 BP/选手数据）、改判、轮空、删局；晋级流转与下游重算
│   ├── standings.ts               # 纯函数：比赛集合 → 积分榜（含头对头、并列检测）
│   ├── leaderboard.ts             # 纯函数：Game 集合 → 选手数据榜
│   ├── bracket.ts                 # 纯函数：比赛集合 → 对阵树视图模型
│   └── audit.ts                   # writeAudit(tx, …) 统一入口
├── server/tournament-bus.ts       # SSE 广播（独立 EventEmitter）
├── data/champions.json            # Data Dragon 静态英雄表（构建脚本生成）
├── app/api/tournament/
│   ├── admin/…                    # requireAdmin + Zod → service
│   └── public/…                   # 只读聚合查询 + SSE stream
├── app/admin/tournament/          # 管理端 5 Tab
└── app/tournament/                # 公开页
```

边界约定：
- service 层纯函数化（入参含 `db`/`tx`），不 import Next/NextAuth，可独立单测。
- 所有写操作在单事务内完成业务变更 + AuditLog 写入 + bus 广播（广播在事务提交后）。
- `standings/leaderboard/bracket` 是无副作用的派生计算，读接口现场调用；唯一物化状态是淘汰赛 `Match.teamA/B`（晋级流转写入），score-service 在改判时负责级联重算下游对阵（清空受影响的下游队伍位与结果，并审计记录）。

---

## 5. 页面设计

### 管理端 `/admin/tournament`（5 Tab）
1. **设置**：选模板（v1 仅一个）→ 填参数 → 校验（出线总数为 2 的幂、队伍数匹配）→ 勾选参赛队伍 → 生成骨架。FINISHED 前可整体重置（需二次确认，连带删除全部比赛数据，审计记录）。
2. **分组**：拖拽分队（或随机分组按钮）→ 确认后生成组内单循环对阵。
3. **赛程**：比赛列表（按阶段/组/日期筛选）；行内编辑 `scheduledAt`；「+ 自定义比赛」可选所属阶段/组、两队、BO 数。
4. **录比分**：比赛详情页按局推进——每局：胜方 → 时长 → BP 录入（按顺序点选 ban/pick，英雄搜索下拉带头像）→ 双方 10 人数据表格（一屏批量填）→ MVP。局保存为草稿，整局字段齐才置完成；系列赛达到 BO 阈值自动结算并触发晋级。轮空一键处理。已结束比赛可重开编辑（改判），下游自动重算。
5. **操作记录**：AuditLog 倒序列表（操作者、时间、动作、对象、变更摘要）。

### 公开页 `/tournament`（免登录 + SSE）
- **赛程**：按日期分组列表——时间、阶段标签、两队、比分/状态，点击进详情。
- **小组赛**：每组积分榜（场次/胜/负/积分，头对头并列高亮）+ 组内对阵网格。
- **对阵图**：淘汰赛树状 bracket，已定胜负高亮 + 晋级连线，未定位次显示占位（"A组第1"）。
- **比赛详情** `/tournament/match/[id]`：逐局 Tab——BP 时间线（双方 ban/pick 头像）、10 人数据对比表、时长、MVP 徽章。
- **数据榜**：选手聚合排行——场均 K/D/A、KDA 比、场均补刀/伤害/金币、MVP 次数；可按字段排序。

middleware：`/tournament`、`/api/tournament/public` 加入 `PUBLIC_PREFIXES`。

---

## 6. 错误处理与边界情况

- **并发**：管理员通常 1-2 人，写接口对同一 Match 的更新用事务 + `updatedAt` 乐观校验，冲突返回 409 提示刷新。
- **改判级联**：淘汰赛改判会清空下游已填入的队伍位；若下游已录比分则拒绝改判并提示先删除下游记录（防止静默丢数据）。
- **删除保护**：赛事进行中不允许删除参赛 Team（DB Restrict + 接口校验）；删除整个赛事需 status=SETUP 或二次确认短语。
- **数据校验**：Zod 端到端——K/D/A/补刀/伤害/金币非负整数；时长 0–120 分钟；BP 英雄不可在同局重复；MVP 必须属于该局参战 10 人。
- **赛季归档**：Season.archivedAt 非空时所有写接口 403，公开页仍可浏览（历史赛事回看）。

---

## 7. 测试策略

- **服务层单测**（重点，vitest + 现有 DB 测试基建）：
  - 模板生成：参数组合 → 阶段/分组/对阵数量与连线正确（含 4/8/16 出线规模）。
  - standings：积分、头对头子表、三队连环套并列检测。
  - 晋级流转：胜者填位、改判级联清空、下游已录拒绝改判。
  - 系列赛结算：BO3/BO5 达阈值自动完结、轮空。
- **API 集成测试**：录比分全流程（建赛事→分组→排期→录局→晋级→决出冠军）、权限（非 admin 写 403、公开读免登录）。
- **派生计算纯函数**：standings/leaderboard/bracket 直接喂内存数据测，无 DB。

---

## 8. 交付里程碑

1. **M1 — 能排能用**：数据模型迁移、模板生成、分组、排期、简单胜负录入（无 BP/选手数据）、公开赛程页 + 积分榜 + 对阵图、SSE。
2. **M2 — 数据完整**：BP 录入、选手数据表格、MVP、比赛详情页、英雄静态数据管线。
3. **M3 — 收尾**：数据榜、审计页、改判级联完善、移动端适配与打磨。

每个里程碑结束时可独立部署使用。
