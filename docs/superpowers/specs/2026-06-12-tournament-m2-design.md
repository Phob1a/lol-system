# Tournament M2 设计 — 局级数据、数据榜、选手页（增量 spec）

日期：2026-06-12 ｜ 状态：rev.1 待审 ｜ 前置：M1（53126f6）+ 赛季-赛事整合（8d3d04c）均已上线

本文是 `2026-06-12-tournament-v2-design.md`（rev.3）中 M2 部分的落地细化，只写增量与契约；原 spec 的局级字段、校验、WALKOVER/表演赛语义维持不变。

## 1. 范围与决策记录

| 决策点 | 结论 |
|---|---|
| 录入双轨 | **保留**：快录（点胜方即一局，现状）与详细编辑器并存；快录局可随时补全数据（用户选定 A） |
| 选手生涯页 | **进 M2 缩水版**：仅当前赛季统计；service 接口按 `seasonId` 参数化，跨赛季汇总为后续扩展（用户选定） |
| 审计日志页 | 不进 M2 |
| 技术债 | 进 M2：公开接口收窄 version/config；决赛完赛自动 FINISHED（均为 codex M1 终审遗留） |
| 数据库 | **零 schema 变更零迁移**（GameBanPick/GamePlayerStat/Game 字段 M1 已建全） |

## 2. 英雄静态表

- `scripts/build-champions.mjs`：拉取 Riot Data Dragon（最新版本号 → `cdn/<ver>/data/zh_CN/champion.json`），生成 `src/data/champions.json`：`[{ key: "Ahri", name: "阿狸", title: "九尾妖狐" }]`，按 key 排序，**提交进仓库**（构建产物可重生成；服务器不依赖外网）。
- `src/lib/tournament/champions.ts`：`getChampions()`（读 JSON）、`championIconUrl(key)` → `https://ddragon.leagueoflegends.com/cdn/<pinned-ver>/img/champion/<key>.png`（版本号一并写入 champions.json 元数据）。图标加载失败 UI 退化为英雄名文字，不做本地图片包。
- `ChampionSelect` 组件：搜索下拉（中文名/key 匹配）+ 头像。

## 3. 局级录入：game-detail-service（新）

### 3.1 数据形状

```
GameDetailInput = {
  blueTeamId?: string | null;          // ∈ {match.teamA, teamB}
  winnerTeamId?: string | null;        // ∈ {match.teamA, teamB}；null = 草稿
  durationSeconds?: number | null;     // 1..7200
  bans?: Array<{ teamId, type: 'BAN'|'PICK', championId, order }> | null;
  playerStats?: Array<{ teamId, registrationId, championId, kills, deaths, assists, cs, damage, gold }> | null;
  mvpRegistrationId?: string | null;
}
```

### 3.2 完整性契约（all-or-nothing）

- **bans**：`null`/缺省 = 不录 BP；提供则整体替换该局 BP 序列，校验：order 从 1 连续递增、championId 同局唯一、teamId ∈ 双方、type 合法。**不强制** 5ban5pick 模板（娱乐赛 BP 非标）。
- **playerStats**：`null` = 不录；提供则必须**恰好双方各 5 条**，registrationId ∈ 该队 TournamentTeamPlayer 快照、同局唯一、六项数据非负整数、championId 必填。整体替换。
- **mvpRegistrationId**：仅当本次保存后该局 playerStats 完整时可设，且 ∈ 该局 10 人。
- 字段独立可补：快录局（已有 winner、无 BP/数据）之后可以只补 BP、或只补数据，互不强制。

### 3.3 草稿与转正

- `saveGameDetail(db, { matchId, gameId?, expectedVersion, detail, actorUserId })`：
  - `gameId` 缺省 = 新建局（index = 现有局数+1，受 bestOf 上限约束）；提供 = 编辑既有局。
  - `winnerTeamId` 为 null → 该局 `isDraft=true`（草稿，不参与结算，公开页不展示）；非 null → `isDraft=false` 转正。
  - **已转正局不可退回草稿**（清胜负请删局）：编辑既有非草稿局时 winnerTeamId 必填。
  - 事务序：claimMatch（CAS 版本认领，复用现有）→ assertSeasonWritable → 状态守卫（CANCELED/WALKOVER 拒绝）→ 若本次保存改变了已转正局的 winner 或新增/转正局导致结算变化 → assertDownstreamClean → 写 Game + 整体替换 bans/stats → resettleMatch → audit `match.game.detail`。
- 快录 `recordGame` 行为不变（建非草稿局，仅 winner）。

## 4. 决赛自动 FINISHED

- 判定"决赛" = 该赛事 KNOCKOUT 阶段中无 outgoing WINNER 边的 match（roundKey 非空）。
- `resettleMatch` 与 `setWalkover`/`cancelMatch` 的结算路径末尾：决赛 FINISHED/WALKOVER 且有 winner → `tournament.status = 'FINISHED'`；决赛结果被回收（删局/取消）→ 若 tournament 为 FINISHED 则回退 `KNOCKOUT`。同事务完成，audit 不另记（随原动作）。
- `resetTournament` 已回 SETUP，不受影响。FINISHED 状态下写操作的既有守卫不变（addCustomMatch 已拒绝 FINISHED；其余写操作按现行为——改判决赛局合法且会触发状态回退）。

## 5. 公开接口收窄 + 管理端读模型（codex 技术债）

- `getPublicTournamentState`：移除 `version`、`config`、`tournament.config`；matches projection 去掉 version。草稿局不出现于任何公开数据。
- 新 `getAdminTournamentState(db, seasonId)`（read-model 同文件）：= 公开形状 + version + config + 每场 games 摘要（含草稿局 isDraft 标记、各局是否已有 BP/完整数据的布尔摘要，供管理端列表显示"待补全"）。
- 新路由 `GET /api/tournament/admin/state`（requireAdmin）。管理端 hook 改为 `useAdminTournamentState`（同 SSE bus，refetch 打 admin 端点）；公开 hook `useTournamentState` 改用收窄后类型。
- 既有 `GET /api/tournament/admin/matches/[id]`（ScoreDialog 用）保留，响应增加 BP/数据完整性摘要与草稿标记。
- 新公开路由 `GET /api/tournament/public/match/[id]`：match 基本信息 + 非草稿局完整明细（BP 序列、10 人数据、MVP、蓝红、时长，含队名/选手昵称/英雄名解析所需映射）。404 当 match 不存在或属非当前赛季赛事。

## 6. 数据榜（leaderboard）

- `src/lib/tournament/leaderboard.ts` 纯函数：`computeLeaderboard(games)`，输入为非草稿且 playerStats 完整的局集合，输出每 registration 一行：`{ registrationId, games, wins, avgKills, avgDeaths, avgAssists, kda: (K+A)/max(1,D), avgCs, avgDamage, avgGold, mvpCount }`，场均保留 1 位小数（kda 2 位）。
- 计入规则（沿用原 spec rev.2 决议）：`countsForStandings=false` 的局**计入**；WALKOVER 无 Game 自然不计；草稿局不计。
- 路由 `GET /api/tournament/public/leaderboard`：活跃赛季赛事的榜单（含昵称/队名解析）。公开页 `/tournament` 新增「数据榜」Tab，列可排序，行链接到选手页。

## 7. 选手页（M2 缩水版）

- `getPlayerSeasonStats(db, playerId, seasonId)`：该选手在指定赛季的汇总（同 leaderboard 行口径）+ 逐场明细（比赛 label、对手、英雄、K/D/A、胜负、是否 MVP）。**签名按 seasonId 参数化**——跨赛季汇总后续加 `getPlayerCareerStats` 聚合多季调用，零表结构改动。
- 路由 `GET /api/tournament/public/player/[playerId]`（当前活跃赛季）。页面 `/tournament/player/[playerId]`（公开，middleware `/tournament` 前缀已放行）。入口：数据榜行点击 + 比赛详情页选手名点击。

## 8. UI

- **GameDetailEditor**（管理端，Dialog，从 ScoreDialog 每局行「详细」按钮 + 底部「+ 详细录入一局」进入）：蓝方 Select、时长输入（分:秒）、BP 编辑器（按 order 逐条添加 ban/pick + ChampionSelect，可整段清空）、双方 5×6 数据表格（每行 ChampionSelect + 六项数字）、MVP Select（10 人）。保存调 saveGameDetail；409 处理同现有模式（toast + refetch 保持打开）。完整性规则前端同步校验（BP 序列连续、10 人齐才可选 MVP 等），后端为准。
- **公开比赛详情页** `/tournament/match/[id]`：头部对阵 + 比分；逐局 Tab：蓝红色条、BP 时间线（头像+顺序）、10 人对比表（按队分列）、时长、MVP 徽章；无详细数据的局显示"仅记录胜负"。
- **数据榜 Tab** 与 **选手页**：见 §6/§7。
- ScheduleList（公开赛程）行点击进入比赛详情页。

## 9. 测试

- champions：脚本生成的 JSON 结构校验（存在、非空、key 唯一）——轻量。
- game-detail-service（TDD 核心）：草稿建局不结算；转正触发结算+晋级；编辑已转正局改 winner 走下游保护；BP 不完整序列拒绝；stats 非恰好 5+5 拒绝；MVP 无 stats 拒绝/非 10 人拒绝；快录局补 BP/数据不影响结算；CAS 版本冲突；归档拒绝。
- 自动 FINISHED：决赛录满 → FINISHED；删决赛局 → 回 KNOCKOUT；非决赛完赛不触发。
- leaderboard：聚合口径（场均/KDA/MVP 计数）、草稿与不完整局排除、表演赛计入。
- 选手页 service：汇总 + 明细、跨赛季参数化（造两季数据验证只取指定季）。
- read-model：公开 state 无 version/config 断言（防回归）；admin state 含之；公开 match 详情不含草稿局。
- 集成：建赛季→分组→快录部分+详细录入部分→决赛→FINISHED→数据榜/详情页/选手页读模型全断言。
- E2E（实跑）：管理端详细录入一局（含 BP+10 人数据+MVP）→ 公开详情页与数据榜断言。**部署前必须实际执行**（上轮 E2E 只改未跑）。

## 10. 范围外（M3+）

- 审计日志查看页；跨赛季生涯汇总页；BP 标准模板强制（5ban5pick）；英雄图标本地化打包；数据导入/导出。
