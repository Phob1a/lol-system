# 选秀 UI 修复设计 — Round Dialog Select 遮挡 + 队伍位置 Hover 卡片

**日期**：2026-05-07
**范围**：两个独立 UI 修复，可在同一实施计划中并行交付。
**修改文件**：4（其中 1 新增）

## 背景

选秀（Draft）是系统核心交互。两个已知问题影响日常使用：

1. **Bug 1**：管理员开始每轮选秀时（点击 "START ROUND N"），打开的 `RoundConfigDialog` 中的「模式」下拉菜单被对话框本身遮挡，无法可靠选择 `ADMIN_ORDER` / `REVERSE_LAST` / `BUDGET_DESC` / `MANUAL` 中的选项。`MANUAL` 模式下的「选择选手」「位置」两个下拉同样受影响。

2. **Bug 2**：队长仪表盘上，鼠标移动到己方或其他队伍的某个位置上时，期望弹出该位置已选选手的详情卡片，但当前**没有任何 hover 反馈**。`PlayerInfoCard` 组件已存在但未被任何视图使用。

两者都属于"小改动、用户痛点高"的修复，应一起完成。

## 范围

**范围内**：

- 修复 `Select` 在 `Dialog` 内被遮挡（影响管理员选秀控制台）。
- 在队长仪表盘的两类队伍视图（己方 `DraggableTeamBoard`、其他 `TeamPanel`）实现位置悬浮选手详情卡。

**明确不在范围**：

- 管理员控制台的队伍预览卡片（`DraftControl.tsx` 内嵌，279-310 行）**不**加 hover——本期仅覆盖队长视图。
- 不引入新的依赖（如 `@radix-ui/react-hover-card`）。
- 不写单元测试；以人工浏览器验证为准（参见「验证」一节）。

## Bug 1 设计：提升 Select 在 Dialog 内的层叠优先级

### 根因

- `RoundConfigDialog` 使用 Radix `<Dialog>`，`DialogContent` 默认 `z-50`。
- 项目内 `src/components/ui/select.tsx` 的 `SelectContent` 同样为 `z-50`。
- 两个 portal 渲染到 `<body>` 末尾，相同 z-index 下 popper 几何上虽在 trigger 附近展开，但因 stacking context 被对话框遮挡。

### 改动

**单一改动**：将 `src/components/ui/select.tsx` 中 `SelectContent` 的 className 从 `z-50` 提升至 `z-[60]`。

```diff
- "relative z-50 max-h-[--radix-select-content-available-height] ..."
+ "relative z-[60] max-h-[--radix-select-content-available-height] ..."
```

### 安全性

- Radix 已通过 Portal 把 `SelectContent` 渲染到 `<body>`，不存在被某个 `overflow: hidden` 父容器裁切的问题。
- 项目内 toast/sonner 默认更高 z-index（`z-[100]` 量级），不会被 z-[60] 反盖。
- 全局 grep 项目内所有 `<Select>` 使用：均为 trigger + popper 标准模式（`ConfigForm.tsx`、`PlayerFormDialog.tsx`、`RoundConfigDialog.tsx` 等），z-[60] 不破坏任何现有交互。

### 验证

参见「验证」一节 Bug 1 清单。

## Bug 2 设计：`PlayerHoverCard` 组件 + 接入

### 新组件：`src/components/draft/PlayerHoverCard.tsx`

**职责**：包裹任意触发元素，鼠标进入后延迟显示一个 portal 到 `<body>` 的浮动 `PlayerInfoCard`，离开后立即隐藏。

**API**：

```tsx
type Props = {
  player: PlayerRef;          // 复用 lib/teams/preview 的类型
  disabled?: boolean;         // 父组件可禁用（拖拽中、提交中）
  children: React.ReactNode;  // 触发区
};
```

**内部状态**：

- `open: boolean` — 卡片是否展示
- `coords: { top: number; left: number } | null` — 卡片定位（fixed 坐标）
- 一个 `setTimeout` 引用作为 150ms 延迟开（关闭立即）

**事件行为**：

| 事件 | 行为 |
|---|---|
| `onMouseEnter`（触发元素） | 若 `disabled` → 忽略；否则记录 `getBoundingClientRect()`，启动 150ms 延时 |
| `onMouseLeave`（触发元素） | 清延时；立即 `open = false` |
| `onPointerDown`（触发元素） | 清延时；立即 `open = false`（捕获拖拽启动那一刻） |
| `disabled` 由 false → true | 立即清延时 + 关闭 |

**定位策略**：

- 默认右侧：`left = rect.right + 8`，`top = rect.top`
- 边界翻转：`left + cardWidth > viewport.innerWidth - 8` 时改为左侧 `left = rect.left - cardWidth - 8`
- 卡片宽度先用估算（280px），portal 渲染后用 `useLayoutEffect` 测量真实 `offsetWidth` 再 set 一次
- 垂直方向：先按 `rect.top` 对齐；若 `top + cardHeight > viewport.innerHeight - 8` 则改为 `top = viewport.innerHeight - cardHeight - 8`

**渲染**：

```tsx
createPortal(
  <div
    style={{
      position: 'fixed',
      top: coords.top,
      left: coords.left,
      zIndex: 70,
      pointerEvents: 'none',
    }}
  >
    <PlayerInfoCard player={player} />
  </div>,
  document.body,
)
```

`pointerEvents: 'none'` 让卡片不响应鼠标，避免在 hover 边缘抖动；进出判定完全由触发元素处理。

z-index 70 略高于 Bug 1 的 z-[60]，确保不会被任何 popper 类组件遮挡。

### 接入点

#### `TeamPanel.tsx`（其他队伍，只读）

在 67-110 行的 `team.slots.map(...)` 中，仅对 `slot.player` 非空的行用 `PlayerHoverCard` 包裹原 `<div>`。空行保持现状，不挂 hover。视觉/布局不变。

#### `DraggableTeamBoard.tsx`（己方队伍，可拖拽）

`DroppableSlot` 内部把 `DraggablePlayer` 包一层 `PlayerHoverCard`：

```tsx
{slot.player ? (
  <PlayerHoverCard player={slot.player} disabled={disabled}>
    <DraggablePlayer slot={slot} disabled={disabled} />
  </PlayerHoverCard>
) : (
  <span>— empty —</span>
)}
```

`disabled` 透传现有的 `submitting` 状态。同时 `PlayerHoverCard` 自身的 `onPointerDown` 监听负责在拖拽刚启动那一刻立即关闭卡片，避免 dnd-kit 拖拽过程中卡片仍悬浮。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `src/components/ui/select.tsx` | className 内 `z-50` → `z-[60]` |
| `src/components/draft/PlayerHoverCard.tsx` | **新增**，~70 行 |
| `src/components/draft/TeamPanel.tsx` | 已填充行包裹 `PlayerHoverCard` |
| `src/components/captain/DraggableTeamBoard.tsx` | 已填充行包裹 `PlayerHoverCard`，`disabled` 透传 |

## 验证

**自动化测试**：不写。两个改动均为视觉/交互层，回报低。

**人工浏览器验证清单**：

### Bug 1（Select z-index）

1. `npm run dev`，以管理员登录。
2. 启动选秀；让一轮结束；点击 "START ROUND N"。
3. 点击「模式」下拉，**4 个选项完整可见**且能点选。
4. 切到 `MANUAL`，每队的「选择选手」「位置」两个 Select 也能正常展开。
5. 缩小窗口至 800×600，重复 3-4。

### Bug 2（PlayerHoverCard）

1. 以队长登录，进入仪表盘。
2. 鼠标移到**己方队伍**某已填充位置 → ~150ms 后卡片出现在右侧；移开立即消失。
3. 鼠标移到**其他队伍**某已填充位置 → 同上。
4. 鼠标移到**空位** → 不出现卡片。
5. **拖拽**己方队伍某位置选手 → 拖拽启动那一刻卡片消失，全程不出现。
6. 把窗口缩到右侧空间不足 → 卡片**翻转到左侧**。
7. 滚动页面后 hover → 定位仍正确（fixed + viewport 坐标，不受滚动影响）。

### 回归

- `grep -rn "<Select" src/` 抽查所有 Select 用法仍正常。
- Toast / Dialog / 其他 popper 与 hover 卡片的视觉层叠：toast 应在最上层（其 z-index 已是 z-[100] 量级），hover 卡片（z-70）不会盖住 toast。

## 不在做（Out of scope）

- 管理员控制台的队伍卡片不加 hover。
- 不引入 `@radix-ui/react-hover-card`。
- 不为 `PlayerHoverCard` 写单元测试。
- 不重构 `PlayerInfoCard`（沿用现有视觉）。
- 不解决可能的可访问性问题（键盘 focus 触发 hover）——本期仅覆盖鼠标交互；如需键盘可达，后续单独立项。
