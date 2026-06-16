# 对局数据导入（脚本直推 + JSON 上传）设计

- 日期：2026-06-17
- 方案：A（导入数据挂进现有赛事结构 Tournament → Match → Game → GamePlayerStat）
- 关联：[[lol-capture-tool-state]]、`tools/lol-capture/`

## 1. 背景与目标

`tools/lol-capture/` 已能在国服客户端抓到一局自定义对局的完整结算（`summary.json`，含 10 名选手全字段 stats + teams 目标数据）。现在要让这些数据进入网站系统、计入内战排行榜。

**目标**
1. 提供接口供脚本（lol-capture exe）直接把抓到的 `summary.json` 推到服务器。
2. 后台支持管理员直接上传 `summary.json` 文件导入。
3. 两条入口的数据**先进暂存区，不直接入正式库**；管理员针对每场数据手动选定对应的赛事对阵（Match）、把抓到的 10 名玩家映射到该对阵的已注册选手、可逐项微调，确认后才写入正式库。

**非目标**
- 不做实时监听 / 自动入库（保持手动确认这一关）。
- 不改现有排行榜/积分聚合逻辑（导入最终落到现有 `GamePlayerStat`，排行榜照常消费）。
- 不引入多租户级别的 token 管理（MVP 用单 token）。

## 2. 关键决策（已与用户确认）

1. **Token**：单 token，放服务器环境变量。脚本上传时带 `Authorization: Bearer <token>`。
2. **选手映射**：注册时库里已存选手「游戏内 ID」（`Player.gameId`，形如 `名字#TAG`，全局唯一）。自动按抓取到的 `name#tag` 去匹配**所选对阵两支队伍的花名册**；匹配不上的由管理员手动选。
3. **入库门槛**：必须 10 人全部映射成功才允许确认入库（保证排行榜数据干净）；未映射的由管理员手动补齐。

## 3. 数据流总览

```
[lol-capture exe] --token--> POST /api/tournament/imports ┐
[管理员浏览器上传 summary.json] --session--> 同一入口      ┘
        │
        ▼
   MatchImport 暂存记录 (status=PENDING, 存原始 summary.json)
        │  （后台「导入审核」页）
        ▼
   管理员：选目标 Match + Game 槽位(第几局)
        → 系统按 name#tag 自动映射到该 Match 两队花名册
        → 未匹配的手动选；可逐项微调每名选手数据
        ▼
   POST /api/tournament/admin/imports/[id]/commit
        → 复用现有 saveGameDetail：写 Game + 10 条 GamePlayerStat(按 registrationId)
        → 全字段存 GamePlayerStat.extStats(JSON)
        → MatchImport 标记 COMMITTED，挂上 committedGameId
        ▼
   现有排行榜/积分照常消费
```

## 4. 数据模型变更（Prisma）

### 4.1 新增 `MatchImport`（暂存表）

```prisma
model MatchImport {
  id              String            @id @default(cuid())
  createdAt       DateTime          @default(now())
  source          MatchImportSource // SCRIPT | UPLOAD
  status          MatchImportStatus @default(PENDING) // PENDING | COMMITTED | DISCARDED
  externalGameId  BigInt            // riot gameId，用于去重提示
  gameVersion     String?
  gameMode        String?
  gameType        String?
  queueId         Int?
  mapId           Int?
  gameCreation    BigInt?
  durationSeconds Int?
  rawJson         Json              // 完整 summary.json 原样保留（审计 + 全字段来源）
  committedGameId String?           // 入库后挂的 Game.id
  note            String?

  @@index([status])
  @@index([externalGameId])
  @@map("match_imports")
}

enum MatchImportSource { SCRIPT UPLOAD }
enum MatchImportStatus { PENDING COMMITTED DISCARDED }
```

去重（P1-5）：「同 gameId 不重复入库」是硬门槛，不能只靠应用层查询（并发 commit 会双查皆无再双写）。因此：
- migration 里加 **Postgres partial unique index**：`UNIQUE (externalGameId) WHERE status = 'COMMITTED'`（Prisma schema 无法直接表达"仅某状态唯一"，用 migration raw SQL）。PENDING 仍允许重复。
- 服务层 commit 捕获唯一冲突 → 返回 409「这局已导入过」。
- `externalGameId` 为 `BigInt`，API 出入边界一律转 string：响应里序列化成 string（`NextResponse.json` 不能直接序列化 BigInt）；入口 zod 接受 string 或 safe integer，内部统一转 BigInt。

### 4.2 `GamePlayerStat` 增列：全字段 JSON

```prisma
model GamePlayerStat {
  // ...现有 6 项不变：kills/deaths/assists/cs/damage/gold + championId/teamId/registrationId
  extStats Json? // LCU 全量 stats（~118 字段）+ 召唤师技能；现有列保持不变，排行榜不受影响
}
```

现有 6 项列继续作为排行榜/积分的来源；`extStats` 仅作为「全量留档 + 未来扩展统计」用，先全存上，具体用哪些后续再定。

> 迁移注意：dev 库迁移需走正常 prisma migrate；按 [[lol-capture-tool-state]] / tournament 经验注意 baseline。

### 4.3 英雄数字 ID → Data Dragon key 映射（P1-1）

现有 `GamePlayerStat.championId` 存的是 Data Dragon **key 字符串**（如 `Aatrox`/`Ahri`），`saveGameDetail` 用 `isChampionKey()` 强校验（`src/lib/tournament/game-detail-service.ts`、`src/lib/tournament/champions.ts`、`src/data/champions.json`）。而 capture summary 的 `championId` 是 Riot **数字 ID**（如 240/103）。**绝不能 `String(championId)`**。

做法：
- 扩展英雄数据：在 `src/data/champions.json` 每个英雄增 `riotId`（数字 Riot id；Data Dragon `champion.json` 每条目的 `key` 字段即数字 id，如 Aatrox=266），从 Data Dragon 重新生成；`champions.ts` 增 `championKeyByNumericId(n: number): string | null`。
- 导入 commit 时：数字 championId → key；映射不到的英雄 → 400「未知英雄 id: N，请更新英雄数据」。
- `extStats` 里保留原始数字 `championId` 与抓取到的中文名，便于排查。

## 5. API 设计

所有路径在现有 App Router `src/app/api/**` 下，沿用 zod 校验与 `{ error }` 响应风格。

### 5.1 入口：创建暂存记录
`POST /api/tournament/imports`
- 鉴权：**Bearer token（脚本）或 admin 登录态（上传）二选一**，在 handler 内判定。判定顺序：先看 `Authorization: Bearer`，命中 `MATCH_IMPORT_TOKEN` → SCRIPT；否则必须 admin session → UPLOAD；都没有 → 401。`MATCH_IMPORT_TOKEN` 为空时 token 分支直接不可用（不放行）。
- body：`summary.json` 的内容（gameId/teams/players...）。zod 校验最小必需字段（gameId、players 至少 10、每人 name/championId/teamId/stats）。`externalGameId` 接受 string 或 safe integer，内部转 BigInt。
- 行为：解析头部元信息存列、整体存 `rawJson`，建 PENDING 记录。
- 返回：`{ importId, externalGameId(string), duplicateOfCommitted: bool }`。

### 5.2 审核列表 / 详情（admin）
- `GET /api/tournament/admin/imports?status=PENDING` → 列表。
- `GET /api/tournament/admin/imports/[id]` → 原始数据 + 解析后的 10 人；若已选定 matchId 可带自动映射建议。
- `GET /api/tournament/admin/imports/[id]/mapping?matchId=...` → 给定 Match，返回两队花名册 + 按 `name#tag` 的自动映射建议（命中 registrationId / 未命中标红）。

### 5.3 确认入库（admin）
`POST /api/tournament/admin/imports/[id]/commit`
- body：`{ matchId, expectedVersion, gameIndex, blueTeamId, mappings: [{ capturedParticipantId, registrationId }] x10, overrides?: { [participantId]: { kills?, deaths?, ... } } }`
  - **必须带 `expectedVersion`**（P1-3）——现有保存路径用 Match.version 做 CAS 乐观锁。
  - `winnerTeamId` **不由前端随便传**，由 summary 的 `stats.win` / `teams` 结果派生并校验（P1-4）。
- 校验（P1-4，阵营+胜负一致，不只是"在花名册里"）：
  - `blueTeamId` 必须是 `match.teamAId`/`teamBId` 之一；LCU `teamId=100` 对应 `blueTeamId`，`teamId=200` 对应另一队；
  - 每个 registrationId 必须属于**其 LCU 阵营对应的站内队伍**花名册（不能把蓝方选手映射到红队 registration）；
  - 10 人全映射、10 个 registrationId 互不相同；
  - 10 人的 `stats.win` 两边一致，派生出的 `winnerTeamId` 与 summary 胜方一致；
  - 数字 championId 经 §4.3 映射成 key（映射不到 → 400）；
  - `externalGameId` 未被 COMMITTED 过（DB partial unique，见 §4.1）。
- `gameIndex` 语义（P1-3，定死）：
  - 若该 index 已有 Game 且为 draft/空壳（无 stats）→ 查出 `gameId`，走编辑覆盖；
  - 若该 index 已有正式局或已有 stats → 409；
  - 若 index 不存在且正好等于 `existingGameCount + 1` → 新建该局；
  - 其它（index 不存在且非下一局）→ 409。
- **原子性（P1-2，单事务）**：把 `saveGameDetail` 的核心逻辑抽成可接收 transaction client（`tx`）的内部函数；commit 服务在**同一个 `$transaction`** 内完成：建/改 Game、写 10 条 `GamePlayerStat`、写各人 `extStats`、标记 `MatchImport.status=COMMITTED` + `committedGameId`。**不允许** `saveGameDetail()` 返回后再单独补写 extStats / import 状态。
- 组装入参：playerStats 按 registrationId、championId 用 §4.3 转出的 key、6 项数值取微调后值。

### 5.4 丢弃（admin）
`POST /api/tournament/admin/imports/[id]/discard` → status=DISCARDED。

## 6. 鉴权

- 新增 env：`MATCH_IMPORT_TOKEN`（长随机串）。
- `POST /api/tournament/imports`：handler 先看 `Authorization: Bearer`，等于 env token（且 token 非空）→ 放行(SCRIPT)；否则检查 admin session → 放行(UPLOAD)；都没有 → 401。
- middleware **只精确放行** `POST /api/tournament/imports` 这一个 token 自鉴权入口；**不要**扩大放行 `/api/tournament/admin/imports/**`——后者全部仍走 admin 守卫。

## 7. 选手映射细节

- 候选范围 = 所选 Match 的 teamA + teamB 两队花名册对应的 Registration（经 Team → 花名册 → Registration → Player.gameId）。
- 自动匹配：抓取的 `players[].name`（`gameName#tagLine`）与候选 `Player.gameId` 做精确匹配（大小写/空白归一化）。
- 未命中：审核页该行标红，管理员从候选下拉手动选。
- **阵营约束（P1-4）**：候选不仅要在花名册里，还必须在**该抓取选手 LCU 阵营对应的那支站内队伍**里——蓝方(100)只能映射到 `blueTeamId` 队的花名册，红方(200)只能映射到另一队。自动匹配与手动下拉都按阵营过滤候选。
- 冲突保护：同一 registrationId 不能映射给两个抓取选手；提交时校验 10 个 registrationId 互不相同且都在对应阵营候选内。
- **胜负派生**：`winnerTeamId` 由 summary 各选手 `stats.win` / `teams[].win` 派生（两边一致性校验），不接受前端任意传值。

## 8. 后台 UI

- admin 区新增「对局导入」页：
  - 待处理列表（来源/时间/gameId/模式/是否重复）。
  - 详情：上传 summary 预览（10 人原始数据）+ 选 Match/第几局 + 映射区（自动建议 + 手动下拉）+ 每人数值可编辑 + 确认/丢弃。
  - 「上传 JSON」按钮（入口2）。
- 复用现有 GameDetailEditor 的三态/校验风格与 toast 反馈；提交走 5.3 接口。
- 入库后该局可继续用现有 GameDetailEditor 编辑（事后微调已被现有功能覆盖）。

## 9. lol-capture 改动

- `playerSummary` 增 top-level `participantId`（不再依赖 `stats.participantId`，服务端映射键更稳）。
- 新增可选参数：`--server <baseUrl>` `--token <token>`。
- 抓取成功生成 summary 后，若给了 server+token，则把 summary POST 到 `/api/tournament/imports`；打印上传结果（成功/失败原因）；不给参数则维持现状只存本地文件。
- 上传失败不影响本地 `result_*_raw.json` / `summary.json` 落盘（数据不丢）。

## 10. 校验与错误处理

- 入口：summary 结构不合最小 schema → 400，不建记录。
- commit：未满 10 映射 / registrationId 不在花名册 / gameId 已 COMMITTED / 目标 Game 槽位冲突（matchId+index 已存在且非本次）→ 400/409，附明确中文原因。
- 全程不静默吞错；token 比对失败 → 401。

## 11. 测试

- 单元：summary→saveGameDetail 入参组装；name#tag 自动映射（命中/未命中/大小写）；去重判定；token 鉴权分支。
- 集成：导入→选 Match→映射→commit→生成 Game+10 GamePlayerStat+extStats；重复 gameId 被拒；非花名册 registrationId 被拒。
- 用 `tools/lol-capture` 真实样例 `result_*_summary.json` 作为夹具。

## 12. 已解决的设计评审项（Codex 三号机，2026-06-17）

5 个 P1 已逐条核对代码确认并并入设计：
- P1-1 championId 数字→key 映射 → §4.3。
- P1-2 commit 单事务原子化（抽出可接收 tx 的内部函数）→ §5.3。
- P1-3 `gameIndex` 语义定死 + commit 必带 `expectedVersion` → §5.3。
- P1-4 阵营一致 + 胜负派生校验 → §5.3 / §7。
- P1-5 COMMITTED 维度 partial unique index + BigInt 转 string → §4.1。
- middleware 仅精确放行 `POST /api/tournament/imports`；token 非空才启用；source 判定明确 → §5.1 / §6。

## 13. 实现计划阶段需对齐的细节

- 把 `saveGameDetail` 核心逻辑抽成接收 `tx` 的内部函数时，保证现有 `PUT .../games` 路径行为不变（回归测试覆盖）。
- Team→花名册→Registration 的确切查询路径（TournamentTeam / TeamSlot / TournamentTeamPlayer）以现有 `player-stats-service` 的 join 为准。
- `src/data/champions.json` 增 numeric `id` 的生成方式（重新从 Data Dragon 拉）与构建脚本位置。
