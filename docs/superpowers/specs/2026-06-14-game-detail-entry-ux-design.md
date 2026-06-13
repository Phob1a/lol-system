# 比赛局数据录入体验优化设计

日期：2026-06-14 ｜ 状态：rev.3（codex PASS；含 legacy PICK 保护、蓝方模板、只读 detail 扩展）｜ 前置：M2 局级数据录入已上线

## 1. 目标

降低单局详细数据录入成本。当前 `GameDetailEditor`（~800 行单弹窗）一局要填 蓝方/时长/BP/双方 10 人数据/MVP/胜方，含 10 个英雄选择 + 60 个数字框，BO3/BO5 重复多次，体验差。

本期做三件高性价比改动：

1. **消除英雄重复录入**（方案 Y：选手数据为源，BP pick 自动派生）。
2. **BP 标准模板**（一键生成标准 ban 行）。
3. **数据录入手感**（KDA 合并输入 + 键盘流 + 缺漏内联高亮）。

**后端边界（rev.2 修正）**：不改 `saveGameDetail` 写契约、不改 `BanInput`、不改数据模型。但为支持「编辑既有局」在方案 Y 下正确工作，**需要扩展 admin 只读 detail 读取**（见 §4.6）——这是只读 read model 改动，不动写路径。因此本期不是「零后端改动」，而是「零 save 契约/schema 变更 + 一处只读扩展」。

## 2. 范围与约束

- 前端改动集中在 `src/components/admin/tournament/GameDetailEditor.tsx`、`ScoreDialog.tsx` 及内部 `StatsTable` / BP 区，必要的纯函数抽到独立文件以便单测。
- **不改 `saveGameDetail` 写契约**、不改 `BanInput`、不改数据模型、不改公开 `MatchDetailView` 渲染契约。
- 保存 payload 仍是现有 tri-state 契约：`bans` 仍是 `Array<{teamId,type:'BAN'|'PICK',championId,order}>`，`playerStats` 不变。
- **只读扩展（rev.2）**：扩展 admin `GET /api/tournament/admin/matches/[id]` 的 game 形状，使其返回每个 game 的完整 detail（`bans`、`playerStats`、`blueTeamId`、`durationSeconds`、`mvpRegistrationId`），供编辑既有局回填。仅 SELECT，不动写路径（详见 §4.6）。
- 后端 `validateBans` 既有硬约束（实现必须满足）：`order` 从 1 连续递增；同局英雄（ban+pick 合并）不可重复；championId 必须合法。
- 后端 `validateStats` 既有硬约束：`playerStats` 必须**恰好 10 条（每队各 5）**，不能半份持久化——决定了 §6.3 不完整数据的行为（见 §4.4）。

## 3. 已确认决策

| 决策点 | 结论 |
|---|---|
| 英雄去重方向 | 方案 Y：选手数据行的英雄是真源；BP 的 PICK 自动由选手英雄派生。 |
| BP 顺序保真 | 不还原真实选秀次序（Y 接受的取舍）。派生 PICK 用合成顺序。 |
| BP 模板性质 | 「填充」非「强制」：一键铺标准 ban 行，可再增删。 |
| 后端 | 写契约/schema 零变更；为编辑既有局新增 admin 只读 detail 扩展（§4.6）。 |

## 4. item 1 — 英雄不重复（方案 Y）

### 4.1 数据真源

- 选手数据行的 `championId` 是英雄真源。操作员只在选手行里选英雄（`ChampionSelect` 复用）。
- BP 区不再手动添加 PICK 行；只手动维护 **BAN 行**（队伍 + 英雄）。

### 4.2 PICK 自动派生

保存构建 payload 时（`buildPayload`），当 `bans` 字段需要写入（`bansTouched || statsTouched`）：

- **BAN 段**：收集所有手填 BAN 行（保留各自 teamId/championId），order `1..B`。
- **PICK 段**：来源按数据状态二选一（见 §4.4 对 legacy PICK 的处理）：
  - 选手数据**完整**（`statsAllComplete`）→ **派生 PICK**：对两队各 5 个已填英雄的选手行生成 `type:'PICK'` 条目（`teamId`=该选手队伍，`championId`=该选手英雄）。
  - 选手数据**不完整**但既有局原本带 PICK（`initial.bans` 中的 PICK）→ **保留 legacy PICK**：原样带出这些 PICK（见 §4.4），不丢弃。
  - 既无完整 stats 也无 legacy PICK → 不产生 PICK 段。
- PICK 段 order 接续 BAN 段：`B+1..`（派生时为「队伍A 5 槽 + 队伍B 5 槽」合成顺序；legacy 时按原相对顺序重新编号）。
- 合并后的数组即 `detail.bans`，须满足后端 order 从 1 连续 + ban/pick 英雄全局去重（含 legacy PICK 与 BAN 的去重，见 §4.3）。

### 4.3 客户端校验（保存前）

在现有 `validate()` 基础上扩展：

- BAN 行不可缺英雄；BAN 行之间英雄不重复（已有）。
- **新增**：最终 PICK 段（派生或 legacy）必须两两不重复，且不得与任何 BAN 英雄重复。命中时定位到冲突的选手行/ban 行并提示「同局英雄不可重复：X」，不发请求（避免后端 422 兜底后用户找不到冲突点）。特别地，编辑既有局时若手填 BAN 与某 legacy PICK 撞英雄，须拦截提示。
- 选手英雄未填齐时不派生 PICK（保持草稿可存：见 4.4）。

### 4.4 与 tri-state / 草稿的关系（rev.2 明确不完整 stats 行为）

后端 `validateStats` 只接收恰好 10 条（5+5），无法半份持久化。因此选手数据按三种状态明确处理，消除 rev.1 的「草稿可存」与「缺漏标红」矛盾：

- **完整**（两队各 5 人英雄+数值齐全，`statsAllComplete`）：保存时发送 `playerStats`，并派生 PICK 写入 `detail.bans`（PICK = 10 选手英雄，order 续在 BAN 之后）。
- **完全为空**（操作员没动选手数据，或整段清空 `statsCleared`）：**不发送 `playerStats`**（tri-state：未动=undefined 保留；整段清空=null）；`detail.bans` 回退为仅手填 BAN（BAN 也空则 `null`）。winner/duration/BAN/MVP 等可独立保存——这就是「存草稿」路径。
- **部分填写**（动过选手数据但不满 10 条完整）：**阻塞本次保存**，对缺漏/非法单元格内联标红并滚动定位，提示「选手数据需双方各 5 人填齐才会保存；如只想存其他字段，请整段清空选手数据」。理由：后端存不了半份，静默丢弃用户已输入的部分比报错更让人困惑（这是对 codex 建议「不阻塞」的有意微调——用明确阻塞替代静默不持久化，避免用户误以为半份已存）。

即：§6.3 的缺漏标红只在「部分填写」态触发并阻塞；「完全为空」态不触发、可存草稿。两者不再矛盾。

- 编辑既有局：依赖 §4.6 的只读扩展把原始 detail（BAN 行 + playerStats 英雄/数值 + blueTeamId/duration/mvp）回填进 editor。BP 区只列 BAN 行（现存 PICK 不作为可编辑行）；选手英雄从 `playerStats` 回填。保存时若选手数据完整则 PICK 由选手英雄重新派生覆盖；若操作员未动数据则 `playerStats`/`bans` 按 tri-state 保留不变。

#### 4.4.1 legacy PICK 保护（修 P2-1，防静默丢数据）

现有系统允许「只存 bans 且 bans 含 PICK、不带完整 playerStats」（旧 UI 可手动加 PICK，后端也有纯补 BP 路径）。因此存在中间态：**既有局有 PICK 但无完整 playerStats，操作员只改了 BAN 行**。

editor 必须把 `initial.bans` 中的 PICK 条目单独留存为 **legacy PICK**（不在 BP 区显示为可编辑行，但保存时参与）：

- 若本次保存时选手数据**完整** → 用派生 PICK **覆盖** legacy PICK（数据真源优先）。
- 若选手数据**不完整**（含完全为空：操作员只改 BAN）→ 保存的 `detail.bans` = 手填 BAN 段 + **legacy PICK 段**（接在 BAN 后重新编号），legacy PICK 原样保留，**不得丢弃**。
- legacy PICK 与手填 BAN 之间做去重校验（§4.3）；冲突则拦截提示。
- 仅当操作员显式整段清空 BP（既有的 `clearBans` → `bans=null`）时才连同 legacy PICK 一并清空，这是显式破坏性操作。

这样「编辑旧局 BAN」不会静默删掉原 PICK；只有「填齐 stats」或「显式清空」才会改动 PICK 段。

### 4.5 显示

- BP 区下方加只读「本局英雄」摘要：两队各 5 个英雄图标 + 名（来自选手行），让操作员确认无需手填 pick。
- 选手数据未填齐时摘要提示「填齐双方数据后自动生成 PICK」。

### 4.6 编辑既有局的只读数据回填（rev.2 新增，修 P1）

现状问题：admin `GET /api/tournament/admin/matches/[id]` 只返回 game 摘要 + `_count`（`hasBans`/`hasStats` 布尔），`ScoreDialog.openDetailForGame` 也只把 `id/index/isDraft/winnerTeamId/hasBans/hasStats` 传给 editor。`GameDetailEditor.resetForm` 虽读 `initial.bans/playerStats`，但当前无调用方提供 → 编辑既有局时拿不到原 BAN 行与选手英雄。这在方案 Y 下会导致：编辑既有局若触发 stats 重算，可能拿空数据派生 PICK、清掉既有 BP/数据。

修法（codex 建议 A，采纳）：

- 扩展 admin `GET /api/tournament/admin/matches/[id]` 返回的每个 game 形状，新增完整 detail 字段：`blueTeamId`、`durationSeconds`、`mvpRegistrationId`、`bans:[{teamId,type,championId,order}]`、`playerStats:[{teamId,registrationId,championId,kills,deaths,assists,cs,damage,gold}]`。纯 SELECT（含 `gameBanPick`、`gamePlayerStat` 关联），不改任何写路径/契约/schema。
- `ScoreDialog.openDetailForGame` 把这些字段透传进 `GameDetailEditor` 的 `initial`，使既有回填逻辑（`resetForm` 读 `initial.bans/playerStats/...`）真正生效。
- 编辑既有局时：BP 区回填 BAN 行；选手行回填英雄+数值；blueTeam/duration/mvp 回填。
- 该 GET 已是 admin 守卫，无新增鉴权面。

## 5. item 2 — BP 标准模板（仅 ban）

- BP 区加「套用标准模板」按钮：一键生成标准 BAN 行。默认 **5 蓝 / 5 红 共 10 个 ban，顺序蓝-红交替**（蓝1 红1 蓝2 红2 … 蓝5 红5）。操作员只填英雄。
- **蓝/红来源（修 P2-2）**：蓝方由 `blueTeamId` 决定，而非 `teamA`。公开 `MatchDetailView` 也按 `ban.teamId === game.blueTeamId` 渲染蓝/红，所以模板必须按 `blueTeamId` 派 ban 行的 teamId。
  - 若 `blueTeamId` 已设置：blue = blueTeamId，red = 另一队。
  - 若 `blueTeamId` **未设置**：默认 blue = `teamA`，并**同步把蓝方设为 teamA**（设置 `blueTeamId = teamA.id`、置 `blueTouched`，使其随本次保存持久化）。减少一次手动选蓝方的操作；按钮旁注明「将以 X 队为蓝方」。
- 模板是填充：生成后可继续增删 BAN 行、改队伍。
- 已有 BAN 行时点模板 → 二次确认覆盖。
- PICK 不在模板内（Y 下自动派生）。
- 模板生成逻辑抽为纯函数 **`buildStandardBanRows(blueTeamId, redTeamId)`**（按 blue/red 而非 teamA/teamB），便于单测、避免实现时按 teamA/teamB 写错。

## 6. item 3 — 数据录入手感

### 6.1 KDA 合并输入

- 每个选手行把 K / D / A 三个独立框换成一个「KDA」框，接受 `12/3/7`、`12 3 7`、`12-3-7` 格式，解析成 `kills/deaths/assists`。
- 解析失败或不足 3 段 → 该框内联红框 + 行内提示。
- CS / 伤害 / 金币 保持独立数字框。
- 解析逻辑抽纯函数 `parseKda(input): {kills,deaths,assists} | null`，单测覆盖各分隔符与非法输入。

### 6.2 键盘流

- 行内 Tab 顺序：英雄 → KDA → CS → 伤害 → 金币 → 下一行英雄。
- 在数值框按 Enter 等同移到下一行同列（连续录入更顺）。

### 6.3 缺漏内联高亮

- 仅在「部分填写」态（§4.4：动过选手数据但不满完整 10 条）触发：对未填/非法的单元格（英雄/KDA/CS/伤害/金币）直接标红边框，自动滚动定位到第一个错误处，并阻塞保存。
- 汇总 toast：「选手数据需双方各 5 人填齐才会保存；如只想存其他字段，请整段清空选手数据」。
- 「完全为空」态不标红、不阻塞（可存草稿，§4.4）。

### 6.4 触控

- 选手数据数字框高度/点击区适当加大，照顾移动端/平板录入。

## 7. 与现有功能关系

- 后端写服务 `saveGameDetail` / `validateBans` / `validateStats` 不变；本期前端改变如何**构造** bans payload（派生 PICK），并新增一处 admin 只读 detail 扩展（§4.6）。
- 公开 `MatchDetailView` 继续按 `bans`（含 BAN+PICK）渲染 BP，派生 PICK 后展示不变（顺序为合成顺序）。公开读模型 `getPublicMatchDetail` 不改。
- `ScoreDialog` 编排基本不变，仅 `openDetailForGame` 透传扩展后的既有局 detail（§4.6）。tri-state、版本 CAS、MVP 门控（数据齐全才可选）均不变。

## 8. 测试

纯函数单测：
- `derivePicksFromStats(statsA, statsB, teamAId, teamBId)`：生成 5+5 PICK、teamId 正确、championId 来自选手英雄。
- `buildBansPayload(banRows, statsComplete, derivedOrLegacyPicks, ...)`：order 从 1 连续（ban 段 + pick 段）；stats 完整→用派生 PICK，stats 不完整→保留 legacy PICK 并重新编号；ban 与 PICK 合并去重边界。
- legacy PICK 保护：编辑既有局（有 PICK 无完整 stats），只改 BAN 保存 → 输出仍含原 PICK（重新编号），不丢失。
- `buildStandardBanRows(blueTeamId, redTeamId)`：10 行、蓝红交替（首行 teamId=blueTeamId）、order 正确。
- `parseKda`：`'12/3/7'`/`'12 3 7'`/`'12-3-7'` 成功，`'12/3'`/`'a/b/c'`/空 失败。

组件测试（`GameDetailEditor.test.tsx` / `ScoreDialog.test.tsx`，新增/扩展）：
- BP 区只显示 BAN 行，无手动加 PICK 入口。
- 选手行填齐英雄后保存，payload `bans` 含 10 条派生 PICK（type=PICK、order 续在 ban 之后）。
- 两选手同英雄 / 选手英雄撞 ban → 保存被拦，提示重复、不发请求。
- 不完整 stats 三态：完全为空 → 不发 `playerStats`、可存草稿、不标红；部分填写 → 阻塞保存 + 标红 + 不发请求。
- 编辑既有局（§4.6）：editor 收到带 `bans`/`playerStats` 的 `initial` 时，BP 回填 BAN 行、选手行回填英雄+数值；未改动时保存按 tri-state 保留（不误清）。
- 「套用标准模板」生成 10 个 ban 行；`blueTeamId` 未设置时默认 teamA 为蓝并同步 `blueTeamId`，首 ban 行 teamId = 蓝方。
- KDA 合并框解析 `12/3/7`；非法输入高亮。

读模型测试（admin GET detail，§4.6）：
- `GET /api/tournament/admin/matches/[id]` 返回的 game 含 `bans`/`playerStats`/`blueTeamId`/`durationSeconds`/`mvpRegistrationId`；空 detail 的 game 返回空数组/ null。

回归：现有 `game-detail-service.test.ts` 后端写服务测试不动且继续通过（写契约未变）。

## 9. 范围外

- 不改 save 写契约 / 数据模型（只读 detail 扩展见 §4.6，属本期范围内）。
- 不还原真实 BP 选秀次序。
- 不做粘贴 / OCR / 截图导入。
- 布局 Tab 化、「保存并录入下一局」、关闭未保存确认（原 item 4/5）留下一批。
- 英雄选择器键盘上下选 / 拼音别名搜索（原 item 6）留作小修。
