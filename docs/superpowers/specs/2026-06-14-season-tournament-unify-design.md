# 赛季-赛事物理合一设计（消灭赛季概念）

日期：2026-06-14 ｜ 状态：rev.1 ｜ 前置：赛季-赛事逻辑合一（2026-06-12，已上线）

本设计**推翻**前一版"逻辑合一保留两表"的折中：用户确认要彻底消除"赛季"概念，物理上合并为单一实体"赛事"。前提条件已由用户拍板：**数据全部不保留**（含生产库活跃的大王杯 S），因此不做在线回填迁移，直接重设计 schema + 删库重建。

## 1. 目标与决策记录

| 决策点 | 结论 |
|---|---|
| 整合方式 | **物理合一**：删除 Season 表，单一 `Tournament` 实体承载报名→选秀→组队→赛制全生命周期 |
| 主体身份 | 不保留数据 ⇒ id 身份问题作废；schema 自由重设计为最干净形态 |
| 命名 | **彻底改名（方案A）**：model `Season`→`Tournament`、表 `seasons`→`tournaments`、全部 `seasonId`→`tournamentId`（244 处）、UI/文案"赛季"→"赛事" |
| 状态机 | 两条串行状态机合并为**一条线性生命周期**（§3） |
| 数据迁移 | **destructive reset**：dev + 生产都删库重建，重新 seed admin 账号；无回填、无数据保留 |
| 扩展性取舍 | 放弃"一季多赛事"扩展可能（用户接受） |

## 2. 统一数据模型

### 2.1 删除 `Season` 模型，字段并入 `Tournament`

合并后单一模型（沿用 `tournaments` 表名，承载原 Season 的容器职责）：

```
model Tournament {
  id         String           @id @default(cuid())
  name       String
  kind       String           @default("正赛")
  status     TournamentStatus @default(SETUP)
  config     Json
  teamBudget Float            @default(1000)     // 原 Season 字段
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt
  archivedAt DateTime?                            // 原 Season 字段

  // 原挂在 Season 下的容器关系（外键列名 seasonId → tournamentId）
  registrations Registration[]
  teams         Team[]
  draftSession  DraftSession?

  // 赛制骨架（原本就挂 Tournament）
  stages  TournamentStage[]
  tournamentTeams TournamentTeam[]
  matches Match[]

  @@map("tournaments")
}
```

- 原 `Season.id`/`Tournament.id` 两套 id 合为一套。`Tournament.seasonId @unique` 外键**删除**（不再有父表）。
- `Registration`/`Team`/`DraftSession` 的 `seasonId` 列改名 `tournamentId`，关系指向 `Tournament`，`onDelete: Cascade` 不变。
- `Registration` 的 `@@unique([seasonId, playerId])`→`@@unique([tournamentId, playerId])`、索引同改。`Team`/`DraftSession` 的 `seasonId @unique`/索引同改。

### 2.2 状态枚举合并

删除 `SeasonStatus`，`TournamentStatus` 扩展为统一生命周期（9 态）：

```
enum TournamentStatus {
  SETUP          // 已创建、配赛制、报名未开
  REGISTRATION   // 报名开放
  ROSTER_LOCKED  // 报名截止、锁名单
  DRAFTING       // 选秀/组队进行
  GROUPING       // 选秀完成、分组绑队、未开打（= 原 Tournament SETUP 的职责）
  GROUP_STAGE    // 小组赛
  KNOCKOUT       // 淘汰赛
  FINISHED       // 完赛
  ARCHIVED       // 归档（只读）
}
```

`RegistrationStatus`/`DraftStatus`/`RoundStatus` 等其余枚举不变。

## 3. 统一状态机

### 3.1 合法状态边

```
SETUP         → REGISTRATION
REGISTRATION  → ROSTER_LOCKED
ROSTER_LOCKED → REGISTRATION | DRAFTING      // 可退回开放报名
DRAFTING      → GROUPING                      // 选秀引擎完成时驱动（原 → COMPLETED）
GROUPING      → GROUP_STAGE                   // confirmGroups 驱动
GROUP_STAGE   → KNOCKOUT
KNOCKOUT      → FINISHED
(任意活跃态)  → ARCHIVED                       // 仅经 archiveActiveTournament / 新建赛事时
```

`ARCHIVED`、`FINISHED` 为终态（FINISHED 仅可再 → ARCHIVED）。

### 3.2 各阶段写入门禁（保持现有语义，仅换状态名/字段名）

| 行为 | 允许状态 | 来源 |
|---|---|---|
| 改 config（重建骨架） | SETUP ~ GROUPING（GROUP_STAGE 起锁定） | 原 tournament SETUP 规则，因骨架在创建时已建、合并后该窗口横跨 SETUP→GROUPING |
| 改 teamBudget | SETUP / REGISTRATION / ROSTER_LOCKED | 原 `BUDGET_EDITABLE_STATUSES` |
| 报名增删改 | 名单可编辑态 SETUP/REGISTRATION/ROSTER_LOCKED（公开报名提交限 REGISTRATION） | 原 registration-service（`ROSTER_EDITABLE_STATUSES` + 公开提交 `status==='REGISTRATION'`） |
| 启动选秀 | ROSTER_LOCKED → DRAFTING | 原 draft engine |
| 选秀完成 | DRAFTING → GROUPING | 原 engine.ts 的 `→ COMPLETED`（line 454/559）改为 `→ GROUPING` |
| assignGroups（圈定参赛队+建快照） | GROUPING | 原 tournament SETUP |
| confirmGroups | GROUPING → GROUP_STAGE | 原 confirmGroups |
| addCustomMatch | GROUP_STAGE / KNOCKOUT | 不变（SETUP/GROUPING 拒绝） |
| recordGame / 改赛程 等 | GROUP_STAGE / KNOCKOUT | 不变 |

### 3.3 关键映射：两态并存 → 单态

原模型在"选秀完成后"同时存在 `season.status=COMPLETED` + `tournament.status=SETUP`。合并后塌缩为单一 `GROUPING`。原 tournament 创建发生在 season SETUP 同事务，合并后赛事创建即进入 SETUP，无独立的 tournament-SETUP 概念。

## 4. 服务层改动

### 4.1 创建：两步合一

原 `createSeason`（archiveActiveSeason → season.create → createTournamentShell）与 `createTournamentShell` 合并为单一 **`createTournament(db, input, actorUserId)`**：

- 入参 = 原 CreateSeasonInput 与 tournament 配置合并：`{ name, teamBudget?, kind, config }`。
- 事务：`archiveActiveTournament` → 创建 Tournament(SETUP) 带 kind/config/teamBudget → 建赛制骨架（stages/groups 占位/淘汰赛空位对阵/晋级边，**不建** TournamentTeam 快照，沿用原 shell 逻辑）。
- config 非法整体回滚。
- 老赛季 fallback 入口（无赛事）概念消失——单一实体下不存在"有赛季无赛事"。

### 4.2 season-service 退役，职能并入 tournament-service

| 原函数 | 去向 |
|---|---|
| `getActiveSeason` | `getActiveTournament`（`status != ARCHIVED`） |
| `listSeasons` | `listTournaments` |
| `archiveActiveSeason` | `archiveActiveTournament` |
| `createSeason` + `createTournamentShell` | `createTournament`（§4.1） |
| `updateSeasonBudget` | `updateTournamentBudget`（门禁 §3.2） |
| `transitionSeason` + tournament 内部 status 改写 | 统一 `transitionTournament`，合法边见 §3.1 |
| `BUDGET_EDITABLE_STATUSES` | 保留，类型改 `TournamentStatus` |

`updateTournamentConfig` / `resetTournament`（逻辑合一版已有）保留，config 可改窗口由 SETUP 扩到 GROUPING（§3.2）。

### 4.3 归档只读守卫

`assertSeasonWritable*` → `assertTournamentWritable(db, tournamentId)`：`status===ARCHIVED` 抛 `INVALID_STATE`。所有写服务前置调用（含 registration/draft/team 写入——原本经 season 校验，现直接经 tournament）。

### 4.4 draft engine 等改写

- draft engine `tx.season.update(... 'COMPLETED')` → `tx.tournament.update(... 'GROUPING')`；`'DRAFTING'`/`'ROSTER_LOCKED'` 改写目标表名同改。
- 所有 `db.season.*` → `db.tournament.*`；`seasonId` 入参/变量 → `tournamentId`。

## 5. HTTP 路由

统一到 `/api/tournament` 命名空间，消除 `/api/seasons`：

| 原路由 | 新路由 |
|---|---|
| `POST /api/seasons` | `POST /api/tournament`（body：name/teamBudget?/kind/config） |
| `GET /api/seasons` | `GET /api/tournament`（列表） |
| `GET /api/seasons/[id]` | `GET /api/tournament/[id]` |
| `POST /api/tournament/admin`（创建 shell，老赛季 fallback） | **移除**（创建并入 `POST /api/tournament`） |
| `PATCH /api/tournament/admin`（config）/`/admin/reset` | 不变 |
| 其余 admin/public 赛制路由 | 路径不变，内部 `seasonId`→`tournamentId` |
| registration/draft/team 路由中的 `seasonId` 参数 | 改 `tournamentId` |

> 注：路由路径移动属机械改名，plan 阶段逐一映射；行为契约不变。

## 6. UI

- 全站文案"赛季"→"赛事"。
- `SeasonManager`（建赛季表单）→ `TournamentManager`；表单已含赛事配置区块（逻辑合一版已抽 `TournamentConfigForm`），现合为单一创建表单（name/teamBudget/kind/config）。
- 管理端「赛季管理」入口与「赛事 SetupTab」合并为单一赛事管理视图（创建/配置/状态推进/重置）。
- 公开页（首页门户、赛程、数据榜、选手页）所有 `seasonId` prop/查询 → `tournamentId`，文案改"赛事"。

## 7. 数据库迁移（destructive）

**无数据保留** ⇒ 不做 rename-preserving 迁移，直接重建：

1. 重写 `schema.prisma` 为 §2 形态（删 Season model/SeasonStatus，改 FK 列名，扩 TournamentStatus）。
2. 生成全新 destructive migration（drop 旧表 → create 新表）。dev 库 `prisma migrate reset`；migration 历史可重置（dev 库历史本就有 v1 残留，参见运维笔记）。
3. 生产：先备份（留痕，非回滚用）→ reset/deploy → **重新 seed admin 账号**（脚本见下）→ pm2 restart。
4. 回滚策略：保留 `backup-pre-unify-20260614` 分支 + DB dump（虽不回填数据，代码层可回滚）。

seed：复用现有 admin 初始化脚本（用户名/默认密码 `lol2026`），无业务数据。

## 8. 测试

- season-service 测试整体迁移/重写为 tournament-service：`createTournament` 原子性（骨架同建、config 非法回滚、archive 旧赛事）、`transitionTournament` 9 态边矩阵、budget 门禁、`archiveActiveTournament` 单活跃不变量。
- registration/draft/team 测试：`transitionSeason`→`transitionTournament`，`seasonId`→`tournamentId`，门禁状态名更新（含 `DRAFTING → GROUPING`）。
- draft engine：选秀完成断言 `status===GROUPING`（原 COMPLETED）。
- tournament 既有测试（shell/groups/score/schedule/leaderboard/read-model 等）：`seasonId`→`tournamentId`，去掉 season 父级 setup，骨架/分组/录分全链路通过。
- 集成：建赛事 → 报名 → 锁名单 → 选秀 → 组队完成(GROUPING) → 分组确认 → 小组赛 → 淘汰 → 完赛 → 归档，单一实体单一 status 全链路。
- 归档只读矩阵：ARCHIVED 下报名/选秀/config/assignGroups/recordGame 全拒。

## 9. 范围外

- 一季多赛事（明确放弃）。
- 任何数据保留/迁移回填（用户确认全清）。
- 新赛制模板、季军赛、次级排序等既有 backlog（M3）。
