# 淘汰赛手动排位设计

日期：2026-06-14 ｜ 状态：implemented ｜ 前置：赛季-赛事物理合一已上线（b9aceac）

当前小组赛结束后，管理员点击「收小组进淘汰赛」，系统会按积分榜名次和模板 `seedMap` 自动把出线队填入淘汰赛首轮。用户明确要求改为管理员手动拖拽，并确认采用 **B 方案**：**出线资格仍由小组赛成绩决定，淘汰赛槽位完全由管理员自由拖拽**。

## 1. 目标与非目标

| 项 | 结论 |
|---|---|
| 目标 | 小组赛完成后，系统计算出线队候选池；管理员拖拽这些出线队到淘汰赛首轮槽位；确认后进入 `KNOCKOUT` |
| 排位规则 | 槽位排位不受小组排名、同组回避、交叉规则约束 |
| 出线资格 | 仍按小组积分榜计算；并列无法确定出线时仍拒绝并提示先加赛 |
| 非目标 | 不允许管理员把未出线队拖进淘汰赛；不改变后续胜者晋级边、比分录入、决赛完赛逻辑 |

## 2. 方案比较与决策

| 方案 | 行为 | 取舍 |
|---|---|---|
| A. 全部参赛队自由拖 | 候选池包含所有参赛队 | 最大自由度，但会绕过小组赛结果，容易让小组赛失去约束意义 |
| **B. 出线队自由拖（选定）** | 候选池只包含按成绩出线的队伍，槽位任意拖 | 保留小组赛竞技结果，同时满足管理员手动排淘汰赛对阵 |
| C. 自动填充后允许局部调整 | 先按 `seedMap` 自动填，再允许换位 | 操作更快，但容易让用户误以为仍受自动规则约束 |

采用 B。提供「按排名自动填充」按钮作为草稿生成，但该按钮不是规则来源，管理员可以完全改掉槽位，且不会自动提交。

## 3. 用户流程

1. 赛事处于 `GROUP_STAGE`。
2. 所有小组赛计分比赛完成；若某组出线名次存在并列，系统拒绝进入排位界面并提示先安排加赛。
3. 管理员在赛程页点击「收小组进淘汰赛」。
4. 系统打开「淘汰赛排位」弹窗/面板：
   - 左侧：出线队候选池，展示小组名次标签（如 `A1`、`B2`）+ 队名。
   - 右侧：淘汰赛首轮所有槽位。
   - 管理员拖拽出线队到任意首轮槽位，可替换、清空、重新拖。
5. 管理员点击「确认进入淘汰赛」。
6. 系统校验槽位填满且队伍不重复，写入首轮 `Match.teamAId/teamBId`，赛事状态改为 `KNOCKOUT`。

## 4. 后端设计

### 4.1 拆分 closeGroupStage

现有 `closeGroupStage` 同时做三件事：校验小组赛完成、计算出线队、按 `seedMap` 自动落首轮。新设计拆成两个显式步骤：

- `getKnockoutSeedingDraft(db, tournamentId)`：只读，返回出线队候选池和首轮槽位。
- `confirmKnockoutSeeding(db, { tournamentId, slots, actorUserId })`：写入管理员提交的槽位并推进状态。

`closeGroupStage` 可退役，或改为内部调用默认 `seedMap` 生成 slots 后再调用 `confirmKnockoutSeeding`，但 UI 不再直接走自动落位。

### 4.2 出线队计算

复用现有 `computeStandings` 逻辑：

- 每组必须没有 `SCHEDULED` 小组赛。
- 对 `rank <= config.advancingPerGroup` 的行生成候选队。
- 若任一出线名次 `tied === true`，抛 `STANDINGS_TIED`，文案保留「请安排加赛」。

返回形状：

```ts
type KnockoutSeedCandidate = {
  teamId: string;
  teamName: string;
  groupName: string;
  rank: number;
  seedLabel: string; // A1 / A2 / B1 ...
};

type KnockoutSeedSlot = {
  matchId: string;
  matchLabel: string | null;
  roundKey: string;
  slot: 'A' | 'B';
};
```

### 4.3 写入校验

`confirmKnockoutSeeding` 必须满足：

- tournament 存在且 status 为 `GROUP_STAGE`。
- 归档守卫通过。
- 小组赛仍全部完成；并列仍不存在。确认时重算候选池，不能信任前端缓存。
- 提交的 slots 覆盖首轮全部槽位。
- 每个候选队最多出现一次。
- 每个提交 teamId 必须属于候选池。
- 只写首轮比赛的 `teamAId/teamBId`；后续轮次仍由既有 `MatchAdvancementEdge` 胜者边推进。

不校验：

- A1/B2 等名次顺序。
- 同组回避。
- 交叉/半区规则。

## 5. API 设计

新增或调整现有 route：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/tournament/admin/knockout-seeding?tournamentId=...` | 返回候选池 + 首轮槽位 + 当前已填值 |
| `POST` | `/api/tournament/admin/knockout-seeding` | 提交手动排位并进入 `KNOCKOUT` |

POST body：

```json
{
  "tournamentId": "tour_x",
  "slots": [
    { "matchId": "m1", "slot": "A", "teamId": "team_x" },
    { "matchId": "m1", "slot": "B", "teamId": "team_y" }
  ]
}
```

旧 `/api/tournament/admin/close-groups` 退役并返回 410，避免线上同时存在“自动收小组”和“手动排位”两个语义不同的入口。前端和测试全部迁到新的 `knockout-seeding` route。

## 6. UI 设计

在 `ScheduleTab` 里替换当前「收小组进淘汰赛」按钮行为：

- 按钮展示条件不变：`tournament.status === 'GROUP_STAGE' && allGroupsDone`。
- 点击后先调用 GET 获取候选池和槽位。
- 打开 `KnockoutSeedingDialog`：
  - 左侧「出线队」候选池。
  - 右侧首轮槽位，按 match label 分组。
  - 支持拖拽到空槽、槽位互换、拖回候选池。
  - 提供「清空槽位」。
  - 提供「按排名自动填充」作为草稿按钮，但不自动提交。
- 「确认进入淘汰赛」按钮在所有槽位填满且无重复后可点。

手机端不作为核心编辑场景；布局可纵向堆叠，保证能查看，但拖拽操作以桌面后台为主。

## 7. 数据模型影响

不新增表，不改 Prisma schema。手动排位结果直接物化到现有首轮 `Match.teamAId/teamBId`。

审计日志新增 payload：

```ts
{
  action: 'tournament.knockout.seed.confirm',
  payload: {
    slots: [{ matchId, slot, teamId }],
    candidates: [{ teamId, seedLabel }]
  }
}
```

## 8. 测试

服务层：

- 小组赛未完成时 GET/POST 均拒绝。
- 出线名次并列时 GET/POST 均返回 `STANDINGS_TIED`。
- POST 接受任意候选队到任意首轮槽位，不按 `seedMap` 校验。
- POST 拒绝未出线队。
- POST 拒绝重复队伍。
- POST 拒绝漏槽位。
- POST 成功后首轮 match 双方写入，tournament.status 为 `KNOCKOUT`，后续晋级边保持可用。

组件/路由：

- `ScheduleTab` 在小组赛完赛时打开手动排位 dialog，而不是直接 POST close-groups。
- 旧 close-groups route 返回 410，防止误用自动落位入口。
- dialog 显示候选池和槽位。
- 填满槽位后提交正确 payload。
- `STANDINGS_TIED` 展示先加赛提示。

集成：

- 建赛事 → 分组 → 小组赛完赛 → 手动排位（故意使用非 seedMap 对阵）→ 淘汰赛录分 → 决赛完成。
