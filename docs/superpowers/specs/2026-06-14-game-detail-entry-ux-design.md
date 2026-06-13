# 比赛局数据录入体验优化设计

日期：2026-06-14 ｜ 状态：rev.1 ｜ 前置：M2 局级数据录入已上线

## 1. 目标

降低单局详细数据录入成本。当前 `GameDetailEditor`（~800 行单弹窗）一局要填 蓝方/时长/BP/双方 10 人数据/MVP/胜方，含 10 个英雄选择 + 60 个数字框，BO3/BO5 重复多次，体验差。

本期只做三件高性价比改动，**零后端契约/schema 变更**：

1. **消除英雄重复录入**（方案 Y：选手数据为源，BP pick 自动派生）。
2. **BP 标准模板**（一键生成标准 ban 行）。
3. **数据录入手感**（KDA 合并输入 + 键盘流 + 缺漏内联高亮）。

## 2. 范围与约束

- 改动集中在 `src/components/admin/tournament/GameDetailEditor.tsx` 及其内部 `StatsTable` / BP 区，必要的纯函数抽到独立文件以便单测。
- **不改后端** `saveGameDetail`（`src/lib/tournament/game-detail-service.ts`）契约、不改 `BanInput`、不改数据模型、不改 `ScoreDialog` 编排、不改公开 `MatchDetailView` 渲染契约。
- 保存 payload 仍是现有 tri-state 契约：`bans` 仍是 `Array<{teamId,type:'BAN'|'PICK',championId,order}>`，`playerStats` 不变。
- 后端 `validateBans` 既有硬约束（实现必须满足）：`order` 从 1 连续递增；同局英雄（ban+pick 合并）不可重复；championId 必须合法。

## 3. 已确认决策

| 决策点 | 结论 |
|---|---|
| 英雄去重方向 | 方案 Y：选手数据行的英雄是真源；BP 的 PICK 自动由选手英雄派生。 |
| BP 顺序保真 | 不还原真实选秀次序（Y 接受的取舍）。派生 PICK 用合成顺序。 |
| BP 模板性质 | 「填充」非「强制」：一键铺标准 ban 行，可再增删。 |
| 后端 | 零变更。仅前端在保存时合成 bans payload。 |

## 4. item 1 — 英雄不重复（方案 Y）

### 4.1 数据真源

- 选手数据行的 `championId` 是英雄真源。操作员只在选手行里选英雄（`ChampionSelect` 复用）。
- BP 区不再手动添加 PICK 行；只手动维护 **BAN 行**（队伍 + 英雄）。

### 4.2 PICK 自动派生

保存构建 payload 时（`buildPayload`），若 `bans` 字段被写入（`bansTouched || statsTouched` 任一为真时需要重算，详见 4.4）：

- 收集所有手填 BAN 行（保留各自 teamId/championId）。
- 对两队各 5 个**已填英雄**的选手行，生成 `type:'PICK'` 条目：`teamId` = 该选手所属队伍，`championId` = 该选手英雄。
- `order` 赋值：先 BAN 行按其行序 `1..B`，再 PICK 行接续 `B+1..B+10`（顺序为「队伍A 5 人槽位 + 队伍B 5 人槽位」，合成顺序）。
- 合并后的数组即 `detail.bans`，满足后端 order 连续 + 去重约束。

### 4.3 客户端校验（保存前）

在现有 `validate()` 基础上扩展：

- BAN 行不可缺英雄；BAN 行之间英雄不重复（已有）。
- **新增**：派生 PICK（= 10 选手英雄）必须两两不重复；且不得与任何 BAN 英雄重复。命中时定位到冲突的选手行/ban 行并提示「同局英雄不可重复：X」，不发请求（避免后端 422 兜底后用户找不到冲突点）。
- 选手英雄未填齐时不派生 PICK（保持草稿可存：见 4.4）。

### 4.4 与 tri-state / 草稿的关系

- 仅当**选手数据完整**（两队各 5 人英雄+数值齐全，沿用现有 `statsAllComplete`）时才派生 PICK 并写入 `detail.bans`。
- 数据未填齐（草稿）时：`detail.bans` 只含手填 BAN 行（PICK 不派生），与现状一致，可存草稿。
- `statsCleared`（整段清空选手数据）时：派生 PICK 失效，`detail.bans` 回退为仅手填 BAN（若 BAN 也清空则 `null`）。
- 编辑既有局：现存的 PICK 条目不在 BP 区显示为可编辑行（BP 区只列 BAN 行）；选手英雄从 `playerStats` 回填（既有逻辑）。保存时 PICK 由选手英雄重新派生覆盖。

### 4.5 显示

- BP 区下方加只读「本局英雄」摘要：两队各 5 个英雄图标 + 名（来自选手行），让操作员确认无需手填 pick。
- 选手数据未填齐时摘要提示「填齐双方数据后自动生成 PICK」。

## 5. item 2 — BP 标准模板（仅 ban）

- BP 区加「套用标准模板」按钮：一键生成标准 BAN 行。默认 **5 蓝 / 5 红 共 10 个 ban，顺序蓝-红交替**（蓝1 红1 蓝2 红2 … 蓝5 红5）。操作员只填英雄。
- 模板是填充：生成后可继续增删 BAN 行、改队伍。
- 已有 BAN 行时点模板 → 二次确认覆盖。
- PICK 不在模板内（Y 下自动派生）。
- 模板生成逻辑抽为纯函数 `buildStandardBanRows(teamAId, teamBId)`，便于单测。

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

- 保存校验不再只弹一句笼统 toast：对未填/非法的单元格（英雄/KDA/CS/伤害/金币）直接标红边框，并自动滚动定位到第一个错误处。
- 仍保留一条汇总 toast 说明「双方各 5 人数据须填齐」。

### 6.4 触控

- 选手数据数字框高度/点击区适当加大，照顾移动端/平板录入。

## 7. 与现有功能关系

- 后端 `saveGameDetail` / `validateBans` / `validatePlayerStats` 不变；本期仅改变前端如何**构造** bans payload。
- 公开 `MatchDetailView` 继续按 `bans`（含 BAN+PICK）渲染 BP，派生 PICK 后展示不变（顺序为合成顺序）。
- `ScoreDialog` 编排、tri-state 草稿、版本 CAS、MVP 门控（数据齐全才可选）均不变。

## 8. 测试

纯函数单测：
- `derivePicksFromStats(statsA, statsB, teamAId, teamBId)`：生成 5+5 PICK、teamId 正确、championId 来自选手英雄。
- `buildBansPayload(banRows, statsA, statsB, ...)`：order 从 1 连续（ban 段 + pick 段）、合并去重边界。
- `buildStandardBanRows(teamAId, teamBId)`：10 行、蓝红交替、order 正确。
- `parseKda`：`'12/3/7'`/`'12 3 7'`/`'12-3-7'` 成功，`'12/3'`/`'a/b/c'`/空 失败。

组件测试（`GameDetailEditor.test.tsx`，新增/扩展）：
- BP 区只显示 BAN 行，无手动加 PICK 入口。
- 选手行填齐英雄后保存，payload `bans` 含 10 条派生 PICK（type=PICK、order 续在 ban 之后）。
- 两选手同英雄 / 选手英雄撞 ban → 保存被拦，提示重复、不发请求。
- 数据未填齐 → 只存草稿，payload bans 不含 PICK。
- 「套用标准模板」生成 10 个 ban 行。
- KDA 合并框解析 `12/3/7`；非法输入高亮。
- 缺漏单元格保存时标红。

回归：现有 `game-detail-service.test.ts` 后端测试不动且继续通过（契约未变）。

## 9. 范围外

- 不改后端契约 / 数据模型。
- 不还原真实 BP 选秀次序。
- 不做粘贴 / OCR / 截图导入。
- 布局 Tab 化、「保存并录入下一局」、关闭未保存确认（原 item 4/5）留下一批。
- 英雄选择器键盘上下选 / 拼音别名搜索（原 item 6）留作小修。
