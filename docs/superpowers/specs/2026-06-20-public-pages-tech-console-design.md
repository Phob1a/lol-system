# 公开页全量视觉重构设计 — Tech Arena Console Phase 2

日期：2026-06-20  
状态：approach A approved, implementation pending  
目标页面：`/`、`/live`、`/tournament/player/[playerId]`、`/tournament/match/[id]`  
前置基础：`/tournament` 已在阶段一改为 Tech Arena Console。  
视觉方向：全量公开页重构，而不是只加统一外壳。所有公开页共享同一套深色竞技场语言，但每个页面要围绕自己的核心任务重排首屏。

## 1. 背景

阶段一已经把 `/tournament` 从普通 tab 页面改成公开赛事驾驶舱。用户现在选择阶段二方案 A：其他公开页也要做同等强度的视觉重构，避免从 `/tournament` 点进首页、直播、选手详情、比赛详情时风格断层。

这次目标不是把同一个 hero 粘到每个页面，而是建立完整公开观赛体验：

- `/` 是公开入口和赛事品牌第一屏。
- `/live` 是实时观赛控制台。
- `/tournament/player/[playerId]` 是选手数据档案页。
- `/tournament/match/[id]` 是比赛战报和数据复盘页。

后台管理、队长操作、登录注册仍保持产品工具风格，不套公开端 cockpit 主题。

## 2. 设计决策

| 决策点 | 结论 |
|---|---|
| 用户选择 | A：阶段二做全量公开页重构 |
| 主风格 | 延续 Tech Arena Console：深色舞台、cyan/amber 信号、HUD、粒子点阵、scanline、数据可视化 |
| 信息策略 | 每页重做首屏信息架构，不只是套背景 |
| 复用策略 | 抽出公开端 arena shell、HUD、panel、stat/card、CTA 样式；页面内部重排但不改底层数据源 |
| Atlas | 继续作为未来皮肤预留，不进入阶段二实现 |
| 后台范围 | 不改 admin/captain/login/register |
| 技术边界 | 不改 Prisma schema、不改 API contract、不改赛事状态机、不改选秀引擎 |

## 3. 范围

包含：

- 重构公开首页 `/` 为 Public Gateway。
- 重构直播页 `/live` 为 Live Draft Console。
- 重构选手详情页 `/tournament/player/[playerId]` 为 Player Dossier。
- 重构比赛详情页 `/tournament/match/[id]` 为 Match Report Console。
- 提炼阶段一 arena 视觉基础，形成可复用公开端组件和 CSS 变量。
- 增强移动端布局，保证强视觉下仍可读、无横向溢出。
- 每个页面都要有 loading、empty/error 的 cockpit 风格空态。

不包含：

- 不做 Atlas 皮肤或主题切换。
- 不改后台管理页、队长页、登录注册页。
- 不改选秀 engine、赛事 read model、公开 API 返回结构。
- 不引入 3D/重型动效库。
- 不为了视觉效果编造观赛人数、战力分、热度值或不存在的数据。

## 4. 全局视觉系统

阶段二要把阶段一的 `.arena-console` 从单页样式沉淀成公开端可复用视觉层：

- `PublicArenaShell`：全屏深色背景、点阵、scanline、最大宽度、移动端安全边距。
- `PublicArenaHud`：左侧页面身份，中间系统信号，右侧主要状态/时间/入口。
- `ArenaPanel`：科技边框、括角、低透明背景、可选标题槽。
- `ArenaStatCard`：图标化数字卡，统一 label/value/detail。
- `ArenaCta`：主/次行动按钮，避免各页重复定义 cyan 按钮。
- `ArenaEmptyState`：加载、空态、错误态统一处理。

命名必须保持语义化，不能叫 `CyberCard`、`CyanButton` 这类绑定皮肤的名字。颜色继续通过局部 CSS 变量表达，为未来 Atlas 留出空间。

## 5. 页面设计

### 5.1 Public Gateway `/`

当前首页是浅色背景 + 普通入口卡片。阶段二改为公开端品牌入口。

首屏结构：

1. HUD：`LOL-SYSTEM / PUBLIC GATEWAY`，显示赛事状态、直播状态、数据入口。
2. Hero：展示当前赛事状态文案，主 CTA 指向 `/tournament` 或 `/live`，副 CTA 指向登录。
3. Gateway Grid：用强视觉入口卡连接赛事中心、直播间、数据榜、管理登录。
4. System Feed：用现有 `buildHomeEntries(context)` 派生入口，不新增 API。

要求：

- 首页不做营销落地页，不写大量说明文案。
- 入口卡应像“控制台入口”，不是普通 shadcn card 列表。
- 没有赛事时仍要展示可用入口和清晰空态。

### 5.2 Live Draft Console `/live`

当前直播页已经有 `BroadcastLayout`、`OnTheClockHero`、队伍网格、选手池、事件流。阶段二要把它从白底工具页变成实时直播控制台。

首屏结构：

1. HUD：`LOL-SYSTEM / LIVE DRAFT`，显示当前赛季、选秀状态、轮次。
2. Live Stage：重做 `SpectatorView` 外层，让 `OnTheClockHero` 成为主舞台。
3. Signal Columns：队伍网格、选手池、事件流放入统一 arena panel。
4. Season Selector：保留功能，但视觉上变成 HUD 控件。

要求：

- 保留 `BroadcastLayout` 的移动端 tab 行为，避免重写选秀核心布局。
- `SeasonSelector` 不能在移动端挤压标题；必要时单独换行。
- 无可直播赛事时展示 `LIVE SIGNAL OFFLINE` 空态，而不是普通居中文本。

### 5.3 Player Dossier `/tournament/player/[playerId]`

当前 `PlayerStatsView` 已经有较强的选手 hero 和数据模块。阶段二要做全页档案重构，而不是只包背景。

首屏结构：

1. HUD：`LOL-SYSTEM / PLAYER DOSSIER`，返回赛事页、选手队伍、主位置。
2. Dossier Hero：复用/重塑 `PlayerHero`，使它与 arena shell 统一；保留头像 initials、胜率、KDA、MVP、参团率。
3. Data Grid：英雄池、生涯纪录、雷达、趋势、亮点、比赛记录都放入 arena panel 体系。
4. Navigation：顶部或 hero 内提供返回赛事页、返回数据榜。

要求：

- 不降低现有 PlayerStatsView 的信息密度。
- Recharts 图表仍懒加载 below-fold。
- loading/error 要用选手档案空态。
- 不把选手详情做成纯海报页；数据扫描效率必须保留。

### 5.4 Match Report Console `/tournament/match/[id]`

当前比赛详情页是标准比赛头部 + BP timeline + 选手表格。阶段二要改成赛后/赛前战报控制台。

首屏结构：

1. HUD：`LOL-SYSTEM / MATCH REPORT`，返回赛事页、比赛状态、赛制。
2. Score Stage：重构 `MatchHeader`，中央比分成为视觉主舞台，两侧队伍信息更强。
3. Game Tabs：保留现有 Tabs，但视觉统一为 arena tabs。
4. BP Timeline：增强为可视化信号带，仍使用现有 ban/pick 数据。
5. Player Table：保留表格可读性，外层和状态色改为 cockpit 风格。

要求：

- 已结束比赛突出胜者和比分；未结束比赛突出排期和状态。
- 无详细 game 数据时保留“仅记录胜负”的降级表现。
- 表格在移动端必须可横向滚动或转为紧凑列表，不能撑爆页面。

## 6. 数据与行为

全部沿用现有数据源：

- `/`：`PublicHomeContext`、`buildHomeEntries`、`getTournamentStatusText`。
- `/live`：`listTournaments`、`getDraftSnapshot`、`useDraftStream`、`BroadcastLayout`。
- 选手详情：`/api/tournament/public/player/[playerId]`、`PlayerStatsView` 数据模型。
- 比赛详情：`/api/tournament/public/match/[id]`、`MatchDetailView` 数据模型。

阶段二可以新增纯函数派生 UI 文案和统计，但不能要求 API 新字段。所有“信号、状态、热点”必须能从已有字段解释清楚。

## 7. 组件方案

新增建议目录：`src/components/public-arena/`

| 组件 | 职责 |
|---|---|
| `PublicArenaShell` | 公开端统一背景、宽度、装饰层 |
| `PublicArenaHud` | 页面级 HUD |
| `ArenaPanel` | 通用科技面板 |
| `ArenaStatCard` | 图标化数据卡 |
| `ArenaCta` | 统一 CTA 样式 |
| `ArenaEmptyState` | loading/empty/error |
| `ArenaTabsFrame` | 包装现有 Tabs 的视觉壳 |

页面组件调整：

- `PublicHomePage`：改为 gateway 结构。
- `SpectatorView`：保留数据逻辑，重排外层。
- `SeasonSelector`：适配 HUD 视觉。
- `PlayerStatsPage`：用 `ArenaEmptyState` 处理 loading/error。
- `PlayerStatsView` 和 player-stats 子组件：统一 panel/hero 视觉。
- `MatchDetailPage`：用 `ArenaEmptyState` 处理 loading/error。
- `MatchDetailView`：重构 header、tabs、BP、table 外观。

## 8. 移动端要求

- 每页 Playwright 截图覆盖 390px 宽度。
- `document.documentElement.scrollWidth - clientWidth` 必须为 `0`。
- HUD 允许换行，但不能遮挡标题。
- 入口按钮必须纵向堆叠，不允许文字挤出按钮。
- 表格区域允许内部横向滚动，但页面根不能横向滚动。
- 装饰层在移动端降噪，不抢内容对比度。

## 9. 测试与验收

自动验证：

- `npm run typecheck`
- 首页现有 `PublicHomePage.test.tsx` 继续通过，并新增/更新断言确认 gateway 文案。
- 直播页新增/更新 `SpectatorView` smoke test：有赛季、无赛季/空态。
- 选手详情保留 `PlayerStatsView.test.tsx`，新增 loading/error 页面测试。
- 比赛详情保留 `MatchDetailView.test.tsx`，新增 header/report 视觉语义断言。

浏览器验收：

- `/` 首屏是 Public Gateway，不再是普通入口卡列表。
- `/live` 首屏是 Live Draft Console，保留选秀实时布局。
- `/tournament/player/[playerId]` 首屏是 Player Dossier，数据模块仍完整。
- `/tournament/match/[id]` 首屏是 Match Report Console，比分/BP/选手数据可读。
- 桌面和移动端四页都无横向溢出。
- 从 `/tournament` 跳转到比赛详情、选手详情时风格连续。

## 10. 分阶段实施建议

阶段二内部仍应拆小步：

1. 抽取 `public-arena` 通用视觉组件，不改页面。
2. 重构 `/` 首页并验证。
3. 重构 `/live` 直播页并验证。
4. 重构选手详情页并验证。
5. 重构比赛详情页并验证。
6. 跑全量相关测试、typecheck、四页桌面/移动截图。

每一步都必须能独立通过测试和截图，不等全部页面做完才发现移动端问题。

## 11. 风险

- 全量重构改动面大：用通用组件先收敛视觉语言，再逐页迁移。
- `/live` 有复杂实时状态：不改 `useDraftStream` 和 `BroadcastLayout` 核心行为，只重排外壳和容器。
- 选手/比赛页数据密度高：不能为了海报感牺牲表格和图表扫描效率。
- 移动端最容易溢出：每页迁移后立即跑 390px 截图和 overflow 检查。
- 未来 Atlas 皮肤仍可能出现：组件命名和 CSS 变量保持语义化，不写死主题名。

## 12. Self-review

- Placeholder scan：没有 `TBD`、`TODO` 或未定义页面范围。
- Internal consistency：阶段二明确是 A 全量公开页重构，但仍排除后台和数据层改造。
- Scope check：范围较大，但四个公开页共享同一视觉系统，可拆为一个阶段二 plan 下的独立任务。
- Ambiguity check：每页的核心保留项、不可改项和验收条件都已明确。
