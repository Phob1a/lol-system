# 选手清单(PlayerPool)布局重构 — 设计

**状态:** 已批准(brainstorming)
**日期:** 2026-05-21
**作者:** lixuan.dai(与 Claude)
**范围:** 重构 `src/components/draft/PlayerPool.tsx` 的视觉布局,使其在选秀控制台的窄栏(`lg:w-1/5`)里清爽、一致。纯视觉重构 —— 不改任何数据、行为、props、路由或 API。

---

## 1. 背景与目标

管理员选秀控制台为三栏布局(`BroadcastLayout`):左栏 = 选手清单(`PlayerPool`),中栏 = 操作/当前队伍/队伍网格,右栏 = 事件流。选手清单渲染在约 280px 宽的窄栏里,目前观感杂乱。

经确认,问题集中在三点(用户多选确认 A、C、D;B「卡片排版乱」不在范围内):

- **A · 筛选面板太挤** —— 搜索、4 个排序键、重置、主/副位置各 5 个、费用上下限、3 个选取状态,十余个控件全堆在窄栏里,`grid-cols-[1fr_auto_auto]` / `grid-cols-2` / `grid-cols-3` 在窄宽下换行错位。
- **C · 中英文混杂** —— `BY ID`、`COST ↑`、`PRIMARY (OR)`、`RESET`、`showing X of Y`、位置英文枚举等,与系统其余中文界面不一致。
- **D · 信息密度高、字太小** —— 大量 `8–10px` 小字与细边框,直播时不易扫读。

**目标:** 选手清单在窄栏里清爽、可扫读、全中文,且默认状态下选手卡片占据主要视野。

**非目标:** 不改筛选/排序/搜索的逻辑;不改选手卡片的信息结构(B 不在范围);不改 `BroadcastLayout` 的三栏结构与栏宽;不改其它组件。

---

## 2. 已确认决策

| 决策 | 选择 |
|---|---|
| 筛选面板形态 | **方案 A · 折叠式筛选** —— 搜索框 + 状态条常驻,其余筛选收进可展开面板 |
| 选手卡片 | 保持现有信息结构(昵称 / `@gameId` / 位置色块 / 费用 + `renderActions`),仅去掉会在窄栏溢出的 `minmax(280px,1fr)` 网格,改为单列纵向列表 |
| 语言 | 全部本地化为中文 |
| 密度 | 正文字号 `8–10px` → `11–13px`;位置色块、内边距相应放大 |
| 改动文件 | 仅 `src/components/draft/PlayerPool.tsx` |
| 栏宽 | 不变(`BroadcastLayout` 的 `lg:w-1/5` 保留) |

---

## 3. 组件结构

`PlayerPool` 重构后由两段组成:**筛选区** + **选手卡片列表**。

### 3.1 筛选区 — 折叠式

新增一个本地 UI state:`filtersOpen: boolean`,默认 `false`。不影响任何已有 state(`filter`、`sort`)。

**常驻部分(始终可见):**
- 搜索框(整行)—— 绑定 `filter.search`,占位符「搜索昵称 / 游戏 ID」。
- 状态条一行:
  - 左:`未选 {visible.length} / {players.length} 人`(由现有 `visible`、`players` 派生,不新增计算)。
  - 右:`筛选` 切换按钮 —— 切换 `filtersOpen`;带一个徽标显示「折叠区内生效的筛选条件数」。
  - `重置` 按钮 —— 调用现有 `reset()`。

**折叠部分(`filtersOpen` 为 `true` 时显示):** 纵向分区,每组一个中文标题(`cap`)+ 一行按钮:
1. **排序** —— 4 个分段按钮:默认 / 按位置 / 费用 ↑ / 费用 ↓(对应 `SORT_OPTIONS` 的 `gameId-asc` / `primary-asc` / `cost-asc` / `cost-desc`)。
2. **主位置** —— 5 个位置切换按钮(`POSITION_OPTIONS`,中文标签),调用现有 `togglePos('primaryPositions', …)`。
3. **副位置** —— 同上,`togglePos('secondaryPositions', …)`。
4. **费用区间** —— 两个数字输入(现有 `NumField`,本地化标签),绑定 `filter.costMin` / `filter.costMax`,保留 `step="any"`。
5. **选取状态** —— 3 个分段按钮:全部 / 未选 / 已选(`all` / `unpicked` / `picked`)。

**徽标计数规则:** 统计折叠区内生效的条件,搜索不计(因其常驻可见)。生效判定:`primaryPositions` 非空、`secondaryPositions` 非空、`costMin != null`、`costMax != null`、`pickedStatus !== 'all'` —— 每项计 1;排序非默认不计入(排序不算「筛选」)。计数为 0 时不显示徽标。

### 3.2 选手卡片列表

- 容器由 `display:grid; gridTemplateColumns: repeat(auto-fill, minmax(280px,1fr))` 改为单列纵向列表(`flex flex-col`),消除窄栏里 280px 轨道导致的溢出。
- 单张卡片的信息结构不变:左侧昵称 + `@gameId` + 位置色块(主位填充、副位描边),右侧费用 + `renderActions`。
- 本地化:卡片上的 `PICKED` 徽标 → `已选`;费用旁的 `CR` 后缀 → 小字「费用」标签。
- 密度:昵称、费用等字号上调到第 2 节规定区间;位置色块由 `w-5 h-5` 视觉规模略增,内边距放大;空态文案「没有匹配的选手」保留。

---

## 4. 本地化对照表

| 现状 | 改为 |
|---|---|
| `search nickname or gameId…` | 搜索昵称 / 游戏 ID |
| `BY ID` / `BY POS` / `COST ↑` / `COST ↓` | 默认 / 按位置 / 费用 ↑ / 费用 ↓ |
| `PRIMARY (OR)` / `SECONDARY (OR)` | 主位置 / 副位置 |
| 位置键 `TOP/JUNGLE/MID/ADC/SUPPORT` | 上单 / 打野 / 中单 / 射手 / 辅助(用 `POSITION_LABEL`) |
| `COST ≥` / `COST ≤` | 费用区间(两个输入框,占位符「最低」「最高」) |
| `PICKED` 段标题 · `ALL/UNPICKED/PICKED` | 选取状态 · 全部 / 未选 / 已选 |
| `⟲ RESET` | 重置 |
| `showing 42 of 60` | 未选 42 / 60 人 |
| 卡片 `PICKED` 徽标 | 已选 |
| 费用 `CR` 后缀 | 费用(小字标签) |

位置色块内的标记改用中文单字(上 / 野 / 中 / 射 / 辅),与筛选按钮的中文标签风格统一;现有 `POS_LETTER` 字母映射(T/J/M/A/S)相应替换为中文单字映射。

---

## 5. 行为保真与验证

**保真约束:** 这是纯视觉重构。`PlayerPool` 的 props(`players: RegistrationForPool[]`、`renderActions?`)、`filter` / `sort` state、`filterPlayers` / `sortPlayers` 调用、`togglePos`、`reset`、`renderActions` 渲染逻辑、空态处理 —— 行为效果必须完全等价。只允许改 JSX 结构与 `className`,以及新增 `filtersOpen` 这一纯展示用的本地 state。

`PlayerPool` 被 `DraftControl`(管理员)、`CaptainDashboard`(队长)、`SpectatorView`(观众)三处共用。重构对三处一致生效 —— 三处都受益于更清爽的窄栏布局,这是预期结果。

**验证:**
- `npm run typecheck` —— 零错误(props 未变 → 类型通过)。
- `npm run test` —— 维持 68/68(测试覆盖 service 与纯函数,不覆盖 UI;作为「重构未破坏 import/类型」的回归护栏)。
- 浏览器冒烟:在运行中的 dev server 上,管理员选秀控制台、队长端、观众端的选手清单均渲染干净;搜索、排序、位置/费用/状态筛选、重置、`renderActions`(队长端「选他」按钮)均正常工作;筛选面板可展开/收起,徽标计数正确。

---

## 6. 范围外 / 后续

- 选手卡片信息结构的重新设计(B,用户认可现状)。
- `BroadcastLayout` 三栏结构、栏宽调整。
- 中栏(操作条 / 当前队伍 / 队伍网格)、右栏(事件流)的布局。
- 任何功能或数据层改动。
