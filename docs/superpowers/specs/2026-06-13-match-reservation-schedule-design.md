# 比赛预约排期重构设计

日期：2026-06-13 ｜ 状态：rev.2（采纳 Claude Code review）｜ 前置：M1 + 赛季整合 + M2 + 赛程时间表已上线

## 1. 目标

把“排期”从一次性铺满所有比赛，改成按需预约单场比赛。

核心边界：**比赛是赛制对象，预约是时间对象**。系统仍按赛制预生成比赛记录；管理员和队长创建的是“预约”，即从候选比赛中选择一场并设置 `scheduledAt`。这样不破坏积分、完赛判断、收小组、淘汰赛推进。

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 比赛记录 | 继续预生成。确认分组生成小组赛；收小组生成/填充淘汰赛。 |
| 创建入口 | 文案用“创建预约”，不是“创建比赛”。从未预约的既有比赛中选择。 |
| 队长权限 | 任一参赛队长可直接预约、改期、取消预约自己队伍参与的比赛；本期不做对手确认流。 |
| 取消语义 | 取消预约只清空 `scheduledAt`，不把比赛状态改成 `CANCELED`。 |
| 真正取消比赛 | 保留为管理员特殊操作，不放入普通预约流。 |
| 候选限制 | 小组赛只能约同组对阵；淘汰赛只能约双方已确定且含本人队伍的对阵。 |
| 批量排期 | 本期退役现有自动顺排/批量排期入口，避免与新预约流形成两套写 `scheduledAt` 的路径。 |
| 数据库 | 零 schema 变更。继续使用 `Match.scheduledAt` + `Match.version`。 |

## 3. 后端模型

### 3.1 预约对象

预约不是新表。预约状态由 `Match.scheduledAt` 表达：

- `scheduledAt !== null`：已预约。
- `scheduledAt === null`：未预约，可进入候选池。

不引入独立预约状态，避免和 `Match.status` 形成双状态源。`Match.status` 仍只表达赛制/比赛结果状态：`SCHEDULED`、`FINISHED`、`CANCELED`、`WALKOVER`。

### 3.2 候选比赛定义

一场比赛可被“创建预约”选择，必须满足：

- `status === 'SCHEDULED'`
- `scheduledAt === null`
- `teamAId` 和 `teamBId` 均非空
- 赛季非归档
- 赛事状态不是 `SETUP` 或 `FINISHED`

管理员候选：

- 小组赛：任意小组内未预约对阵。
- 淘汰赛：双方已确定的未预约对阵。

队长候选：

- 必须包含当前队长的 `teamId`。
- 小组赛：对手必须与自己同组。实际由既有 `Match.groupId` 和 group membership 保证。
- 淘汰赛：只允许双方已确定且包含自己队伍的淘汰赛 match。

### 3.3 修改与取消预约

修改预约：

- 仅更新 `scheduledAt`。
- 必须带 `expectedVersion`，CAS 成功后 `version + 1`。
- 不触发 `resettleMatch`，不改变胜负、积分、晋级。
- 成功后 publish tournament invalidation，SSE 客户端重拉。

取消预约：

- 是修改预约的特例：`scheduledAt = null`。
- 不调用 `cancelMatch`。
- 不改变 `Match.status`。

状态限制：

- 队长只能操作 `status === 'SCHEDULED'` 的比赛。已经完赛、轮空、真正取消的比赛不可由队长改预约。
- 管理员普通预约流也只操作 `status === 'SCHEDULED'`；如需处理历史/异常比赛，保留现有管理员特殊操作入口。

### 3.4 服务接口

新增/收敛服务函数，避免在路由里散落权限判断：

```ts
listReservableMatches(db, input: {
  tournamentId: string;
  actor: { role: 'ADMIN' } | { role: 'CAPTAIN'; teamId: string };
}): Promise<ReservableMatch[]>

reserveMatch(db, input: {
  matchId: string;
  expectedVersion: number;
  scheduledAt: Date | null;
  actorUserId: string;
  actor: { role: 'ADMIN' } | { role: 'CAPTAIN'; teamId: string };
}): Promise<void>
```

`reserveMatch` 内部统一做：

1. 事务内 `claimMatch(matchId, expectedVersion)`。
2. `assertSeasonWritable(tx, match.tournamentId)`。
3. 校验 `status === 'SCHEDULED'`、双方已确定。
4. 队长 actor 额外校验 `teamId` 是 `teamAId/teamBId` 之一。
5. 更新 `scheduledAt`。
6. 写审计：沿用现有单场动词 `match.reschedule`，payload 标明 `{ scheduledAt, actorRole, reservation: true }`。不新增 `match.reservation.*` 动词，避免同一类 `scheduledAt` 变更出现多套审计动作。

现有单场 `rescheduleMatch` 可被 `reserveMatch` 吸收或改造成内部 helper，但对外新 UI 必须统一走 `reserveMatch` 语义。现有批量 `rescheduleMatches` / `POST /api/tournament/admin/schedule/batch` 在本期退役：产品 UI 不再调用；实现时应删除该路由或让它返回明确的 410/422，不允许继续作为可写 `scheduledAt` 的第二路径。原因是该批量路径没有 `status === 'SCHEDULED'`、双方已确定、预约候选等校验，会和新预约流产生校验分歧。

### 3.5 路由

管理员：

- `GET /api/tournament/admin/reservations/candidates?tournamentId=...`
- `PATCH /api/tournament/admin/reservations/[matchId]`
  - body：`{ expectedVersion: number, scheduledAt: string.datetime() | null }`

队长：

- `GET /api/captain/reservations`
  - 返回当前队伍已预约比赛 + 可预约候选。
  - 不传 `tournamentId`；路由由当前活跃赛季解析 tournament，再按 session.teamId 过滤。
- `PATCH /api/captain/reservations/[matchId]`
  - body 同管理员。
  - require CAPTAIN，且 session.teamId 必须存在。

错误映射：

- 参数错误 → 422。ZodError 在 route 内单独 catch，保持现有路由写法。
- 队长操作非本队比赛 → 403。实现必须新增 `TournamentErrorCode = 'FORBIDDEN'` 并在 `route-errors.ts` 的 STATUS 表映射到 403；不要在每个 route 手写 403，避免权限错误分散。
- match 不存在 → 404
- version 冲突 → 409
- 状态不允许 / 赛季归档 → 422。沿用现有 `INVALID_STATE` 映射，不改全局语义。

## 4. 管理员排期页

### 4.1 页面重构

把现有「列表 / 排期」双视图收敛成预约工作台：

- 默认展示“已预约比赛”列表，按日期升序分组。
- 顶部按钮：「创建预约」。
- 每行操作：
  - 修改时间（仅 `status === 'SCHEDULED'` 可用；已完赛/轮空/取消比赛只读展示）
  - 取消预约（仅 `status === 'SCHEDULED'` 可用；已完赛/轮空/取消比赛只读展示）
  - 录比分
  - 轮空
  - 更多：真正取消比赛（管理员特殊操作，需二次确认，文案必须写“取消比赛”）

移除普通排期流里的“自动顺排”和批量排期面板。它们和“按需预约”目标相冲突；如以后需要批量导入时间，再单独设计为管理员高级工具，并复用预约候选校验。

### 4.2 创建预约 Dialog

字段：

- 阶段筛选：小组赛 / 淘汰赛。
- 小组/轮次筛选。
- 对阵选择：只显示候选比赛。
- 时间：`datetime-local`，5 分钟步进，可手填。

提交后调用 admin reservation PATCH，将候选 match 的 `scheduledAt` 从 null 改为选定时间。

空态：

- 无候选比赛：显示“暂无可预约比赛”。
- 无已预约比赛：显示“暂无已预约比赛，可点击创建预约”。

## 5. 队长页面

### 5.1 导航

队长导航增加「比赛预约」。在赛季进入 `COMPLETED` 后可见；更早阶段队伍阵容未完成，不展示预约入口。

理由：当前 draft engine 在选秀完成后把赛季置为 `COMPLETED`，而赛事的小组赛/淘汰赛运行期间赛季保持 `COMPLETED` 直到归档。因此 `COMPLETED` 是队长预约窗口，而不是赛事已经结束。

### 5.2 页面内容

队长预约页展示两个区块：

- 已预约：当前队伍参与且 `scheduledAt !== null` 的比赛。
- 可预约：当前队伍参与、双方已确定、`scheduledAt === null`、`status === 'SCHEDULED'` 的比赛。

操作：

- 创建预约：从“可预约”列表选择一场 + 时间。
- 修改预约：对已预约比赛修改时间；仅 `status === 'SCHEDULED'` 可用。
- 取消预约：清空该比赛时间；仅 `status === 'SCHEDULED'` 可用。

已预约列表会包含已完赛、轮空、真正取消的历史比赛；这些行只读展示，不显示或禁用“修改预约/取消预约”。后端仍用 `status === 'SCHEDULED'` 兜底，避免前端状态过期时误写。

页面只展示自己队伍相关比赛，不暴露其它队伍完整排期管理面。

## 6. 公开页

公开赛程页继续只展示已预约比赛，即 `scheduledAt !== null`。未预约比赛不展示。

原因：公开用户关心“什么时候打”，不是赛制内部还有哪些未约对阵。未预约对阵可在积分/淘汰赛图里通过其它视图体现，不进入赛程时间线。

这是视图层过滤，不是读模型收窄。公开 read model 仍可返回全部 match，以供积分、淘汰赛图和比赛详情入口使用；`ScheduleList` 负责过滤未预约比赛。

## 7. 与现有功能关系

- `confirmGroups` 仍生成小组赛对阵。
- `closeGroupStage` 仍依赖小组赛 match 完成情况，不依赖是否曾预约。
- `addCustomMatch` 保留为管理员“加赛/表演赛”能力，不作为普通创建预约入口。它允许 `scheduledAt=null` 创建自定义比赛；这类比赛创建后若满足候选条件（`status === 'SCHEDULED'`、双方确定、未预约、赛季可写），可以进入管理员预约候选池。队长不能创建自定义赛，只能预约自己相关的既有 match。
- 现有 `SchedulePlanner` 的未排期池 + 自动顺排形态将被预约工作台替代；保留纯函数可按需复用日期分组逻辑。`POST /api/tournament/admin/schedule/batch` 同步退役，不能继续作为生产 UI 的写入路径。
- SSE invalidation 继续复用 `publishTournament({ type: 'tournament.invalidated' })`。

## 8. 测试

服务层：

- 管理员可预约未预约比赛，`scheduledAt` 写入且 version +1。
- 管理员取消预约只清空 `scheduledAt`，`status` 保持 `SCHEDULED`。
- 队长只能预约/改期/取消本队比赛。
- 队长不能操作其它队比赛。
- 队长不能操作 `FINISHED` / `CANCELED` / `WALKOVER` 比赛。
- 淘汰赛双方未确定的 match 不进入候选。
- version 冲突返回 `VERSION_CONFLICT`，不写入。
- 归档赛季拒绝。
- `FORBIDDEN` 新错误码映射 403，队长操作非本队比赛时使用。
- `INVALID_STATE` 继续映射 422，状态不允许/归档不改为 409。
- 批量排期端点退役：不存在或返回明确错误；不能继续成功写入 `scheduledAt`。

路由：

- admin/captain 权限覆盖。
- Zod 校验 datetime/null/expectedVersion。
- 403/404/409/422 映射；ZodError 仍在 route 层单独 catch 为 422。

组件：

- 管理员预约工作台：无已预约空态、创建预约候选筛选、修改时间、取消预约。
- 队长预约页：只显示本队比赛；创建/修改/取消共用同一路径。

E2E：

- 管理员创建一场预约 → 公开赛程出现该比赛。
- 队长登录 → 创建自己比赛预约 → 管理员和公开赛程同步显示。
- 队长取消预约 → 公开赛程隐藏该比赛，比赛仍可再次预约。

## 9. 范围外

- 双方确认、通知、超时自动确认。
- 场地/裁判/直播间资源冲突检测。
- 批量导入排期。
- 队长创建额外加赛或表演赛。
- 真正删除比赛记录。
