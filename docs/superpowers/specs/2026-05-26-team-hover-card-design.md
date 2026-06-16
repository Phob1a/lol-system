# 队伍 Hover 卡片设计

## 目标

在观众页队伍网格、队长页、管理员选秀页中，鼠标悬停在队伍区域时浮现队伍详情卡片，让用户不用点击或展开页面就能看到完整阵容、空缺位置和剩余预算。

## 决策

采用一个通用 `TeamHoverCard` 包装器，行为对齐现有 `PlayerHoverCard`：延迟打开、离开关闭、portal 到 `document.body`、自动避开视口边缘。队伍详情内容由同文件内的 `TeamInfoCard` 渲染。

原因：三个页面的本质需求相同，都是“在扫队伍列表时快速看详情”。做三套页面专属浮层会复制触发逻辑和样式，后续容易分叉。

## 范围

- 观众页和管理员选秀页：二者共用 `TeamGrid` / `TeamCard`，在 `TeamCard` 接入队伍 hover。
- 队长页：在 `TeamPanel` 和己方 `DraggableTeamBoard` 的整张队伍卡片接入队伍 hover。
- 选手 hover 不在本实现范围；`PlayerPool` 等选手列表由 Claude Code 侧复用现有 `PlayerHoverCard` 接入。

## 数据形状

新增 UI 专用类型 `TeamHoverSummary`：

- `captainNickname`
- `captainGameId`
- `budgetLeft`
- `slots: { position, player }[]`

`player` 复用 `RegistrationRef`，为空时显示空缺。`DraftTeamSnapshot` 和 `TeamPreview` 在各自组件边界转换为该形状，不改后端数据结构。

## 交互

- 悬停 150ms 后显示详情卡。
- 离开队伍卡片立即关闭。
- pointer down 立即关闭，避免拖拽己方队伍时浮层残留。
- 卡片不可交互，仅展示信息。

## 验证

- DOM 测试覆盖：`TeamCard` 悬停后显示队伍详情。
- DOM 测试覆盖：`DraggableTeamBoard` 已填充队伍可显示详情，并在 pointer down 后关闭。
- 运行相关测试、typecheck。
