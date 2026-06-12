# 赛程时间表设计 — 拖拽排期面板 + 公开时间线（增量 spec）

日期：2026-06-13 ｜ 状态：rev.2（采纳 codex 审查 3 项）｜ 前置：M1 + 赛季整合 + M2 全部上线（生产 8c7892c）

## 1. 范围与决策记录

| 决策点 | 结论 |
|---|---|
| 范围 | A 管理侧拖拽排期 + B 公开侧时间线视图（用户选定 A+B） |
| 排期交互 | 形态一：未排期池 + 按天分栏卡片拖拽，桌面拖放 / 移动端点击编辑降级（用户选 C 拖拽 + 形态一轻量自研，无第三方日历库） |
| 并行 | 允许同天同时段多场；仅以淡色「同时段还有 N 场」提示，不阻断（用户选定可并行） |
| 倒计时/进行中高亮 | 本期不做（用户决定）；数据结构与组件留扩展位 |
| 时间粒度 | 5 分钟，可手填任意分钟 |
| 数据库 | **零 schema 变更零迁移**（`Match.scheduledAt DateTime?` 早已存在） |
| 后端复用 | 单场沿用现有 `PATCH /api/tournament/admin/matches/[id]` op=reschedule；新增批量端点 |

## 2. 后端

### 2.1 新增 `rescheduleMatches`（score-service）

```
rescheduleMatches(db: PrismaClient, input: {
  items: Array<{ matchId: string; expectedVersion: number; scheduledAt: Date | null }>;
  actorUserId: string;
}): Promise<void>
```

- **全部校验与写入在同一事务内**（codex P1，消除 TOCTOU）：
  ```
  db.$transaction(async tx => {
    1. items 非空、≤200、matchId 唯一（重复 → VALIDATION '比赛重复'，codex P2）
    2. 按 ids 一次性 load 全部 match（含 tournament.season）；缺任一 → MATCH_NOT_FOUND
    3. 全部 match 同属一个 tournament 且 season 非归档（archivedAt 为空）→ 否则 VALIDATION / 归档只读 INVALID_STATE
    4. 逐 item 乐观锁写：updateMany({ where: { id, version: expectedVersion }, data: { scheduledAt, version: { increment: 1 } } })，count=0 → VERSION_CONFLICT '部分比赛已被修改，请刷新'（整体回滚）
    5. writeAudit(tx, 'match.schedule.batch', payload:{count})
  })
  ```
  事务内任一 throw → 全回滚，全有全无。归档校验在事务内完成，避免"校验后写入前赛季被归档"。
- 注：reschedule 不触碰结算，version 仅作并发标记（与现有单场 `rescheduleMatch` 一致——increment version 但不调 resettleMatch）。

> 设计取舍：全有全无而非尽力而为。排期是低冲突操作；批量拖放在前端是一次动作，整体回滚 + 前端 refetch 重试，语义最简单，避免"部分成功"的脏中间态。

### 2.2 路由 `POST /api/tournament/admin/schedule/batch`

- requireAdmin；Zod body `{ items: Array<{ matchId: string; expectedVersion: number; scheduledAt: string.datetime().nullable() }> }`（≥1 项，≤200 项）。
- 调 `rescheduleMatches`（scheduledAt 字符串 → Date）；成功 `publishTournament({ type:'tournament.invalidated' })` + 200；ZodError→422；`toResponse` 兜底（VERSION_CONFLICT→409）。

## 3. 管理侧 UI · 排期面板

位置：管理端「赛程」Tab 顶部加视图切换「列表 / 排期」（默认列表，保留现有表格不动）。「排期」子视图 = 新组件 `SchedulePlanner`。

### 3.1 数据

- 来自现有 `useAdminTournamentState(seasonId)`：matches（含 id/label/roundKey/stage 信息/teamA·teamB/scheduledAt/status/version/groupId）。
- 排除 `status === 'CANCELED'` 的比赛（不参与排期）。

### 3.2 布局与交互

- **左「未排期池」**：`scheduledAt == null` 的比赛卡（对阵双方名 + 阶段/轮次标签 + BO）。
- **右「按天分栏」**：已排期比赛按本地日期分栏（横向滚动），栏头显示日期+星期+场次数；栏内按时间升序，卡片显示 `HH:mm` + 对阵。
- **桌面拖拽**（HTML5 draggable）：
  - 池 → 某天栏：落下弹时间选择 Popover（date 跟随目标栏、time 5 分钟步进可手填）→ 确认即调 batch 端点（单 item）。
  - 栏内/跨栏拖动：落到新栏弹时间选择（预填原时间）；拖回池 = 设 `scheduledAt=null`。
  - 乐观更新本地状态 → 调接口 → **成功后 `await refetch()`**（codex P1：batch 会 increment version，不重取会导致连续拖同一场/顺排后微调用旧 expectedVersion 打到 409；统一成功即 refetch，与现有单场 ScheduleTab 一致）→ 失败 toast + refetch 回滚。
- **移动端降级**（无可靠原生 DnD）：点卡片弹「日期 + 时间」编辑 Dialog（含「移回未排期」按钮）→ 同一 batch 端点。用 `pointer: coarse` 媒体查询或视口宽度切换；两套入口共用同一保存函数。
- **并行提示**：同天同 `HH:mm` 有多场时，卡片角标淡色「同时段 ×N」，不阻断保存。
- **「自动顺排」便捷按钮**（本期含）：对未排期池一键按"起始时间 + 间隔"顺序铺到选定某天（纯前端算出 items 一次 batch 提交）——降低 12 场逐个拖的负担。起始时间/间隔用一个小表单。

### 3.3 归档/状态

- 赛季归档时排期面板只读（后端守卫兜底；前端按赛季态隐藏拖拽，仅展示）。FINISHED 赛事仍可改期（无害）。

## 4. 公开侧 UI · 时间线视图

增强现有 `ScheduleList`（公开页「赛程」Tab，已按日期分组）：

- 每天区块头：日期 + 星期几 + 「N 场」；当天比赛按 `scheduledAt` 升序；`scheduledAt == null` 的归「时间待定」区块置最底。
- 行内沿用现有：时间 `HH:mm`、label、对阵、状态徽章、点击进详情。
- 跨天排序：有时间的天按日期升序在前，「时间待定」置底。
- 不新增倒计时/进行中（本期），但区块组件抽出 `dayKey/sortTime`，便于后续加「今日」高亮与倒计时。
- SSE 失效信号触发重拉（沿用现有 `useTournamentState`）。

## 5. 测试

- `rescheduleMatches`（TDD，DB 集成）：批量设时间成功（含 null 清空回未排期）；某项 version 冲突 → 整体回滚（其余 item 时间不变）；异赛事 matchId 混入 → VALIDATION 拒绝且无写入；**重复 matchId → VALIDATION 拒绝（codex P2）**；归档赛季 → 拒绝；成功后受影响 match 的 version 已 +1（验证 refetch 语义前提）；audit 写入一条。
- 路由：Zod 校验（空数组拒、超 200 拒、scheduledAt 非法拒、重复 matchId 拒）；冲突 → 409；成功 publish。
- 公开时间线纯函数：`groupMatchesByDay(matches)` 抽为可测纯函数（输入 matches → 有序天分组 + 时间待定置底），单测排序与分组、空态。
- SchedulePlanner：核心排序/分组/并行计数逻辑抽纯函数测试；拖拽交互以手动验收为主。
- E2E（实跑）：管理端排期面板把一场未排期比赛拖到某天设时间 → 公开赛程页该比赛出现在对应日期区块。
- 全量回归 + typecheck + build。

## 6. 范围外

- 倒计时 / 「进行中」实时高亮 / 「今日」定位（下一迭代，本期留好结构）
- 直播链接、日历订阅（iCal）、冲突自动检测/避让
- 周历网格形态（形态二，已否决）
