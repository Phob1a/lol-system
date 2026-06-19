# 公开赛事页视觉重构设计 — Tech Arena Console

日期：2026-06-20  
状态：direction locked, implementation pending  
目标页面：`/tournament` 公开赛事页  
视觉方向：A+C 融合，即“赛事海报冲击力 + 精致产品信息层级”，参考 `ai-prep/study-app/static/console.html` 的 cockpit 视觉语言。
后续方向：Atlas 星图风格作为未来扩展皮肤记录，不进入第一阶段。

## 1. 背景

当前公开端已经具备首页、赛事页、赛程、小组赛、对阵图、数据榜、选手详情和比赛详情，但 `/tournament` 仍是工具型 tab 容器：信息都在，第一眼缺少赛事品牌感和观看动机。

用户真正诉求不是再做一次 shadcn 统一，也不是 UX 流程重排，而是让页面“更有设计感”：更强光影、粒子、可视化图标和科技感，同时保留可用性。

## 2. 设计决策

| 决策点 | 结论 |
|---|---|
| 主方向 | Tech Arena Console：电竞赛事数据驾驶舱 |
| 来源 | 用户在 mockup 中选择第一版 A+C |
| Atlas 处理 | 不丢弃；后续可做扩展皮肤/主题，但第一阶段不实现主题切换 |
| 风格关键词 | 深色舞台、cyan/amber 信号色、HUD 顶栏、点阵背景、scanline、括角边框、雷达图、折线、对阵路径、图标化数据卡 |
| 页面范围 | 第一阶段只改公开赛事页 `/tournament`；不改后台管理页 |
| 视觉强度 | 公开赛事页和直播/观赛页面可以强科技感；后台管理页保持清晰产品工具风格 |
| 技术原则 | 复用现有数据和路由，不做 schema/API 重构；先以组件重组和视觉层改造落地 |

## 3. 范围

包含：

- 重构 `PublicTournamentView`，从普通 tabs 改为“赛事中心”页面。
- 新增公开端视觉壳组件：HUD 顶栏、赛事 Hero、下一场面板、热度/数据面板、对阵路径卡、趋势卡。
- 保留并重用现有 `ScheduleList`、`GroupStandings`、`BracketView`、`LeaderboardView` 的核心内容，但调整入口和容器层级。
- 增强视觉：深色 cockpit 背景、粒子点阵、光影、scanline、科技边框、图标化统计。
- 桌面优先，同时保证移动端可读、无内容重叠。

不包含：

- 不改 Prisma schema。
- 不改赛事状态机、赛程排期、比分录入、导入逻辑。
- 不给后台管理页套 cockpit 主题。
- 不实现 Atlas 暖铜星图方向，也不做运行时主题切换。
- 不引入重型动效或 3D 库。第一阶段使用 CSS + SVG + 现有 Recharts 能力。

## 4. 信息架构

`/tournament` 第一屏改成一个可扫描的赛事驾驶舱：

1. **HUD 顶栏**
   - 左：赛事系统品牌 `LOL-SYSTEM / PUBLIC ARENA`。
   - 中：状态信号，如 schedule live、bracket sync、data ready、viewer mode。
   - 右：当前阶段、下一场时间。

2. **Hero 主舞台**
   - 大标题：根据赛事状态生成，例如“决胜夜进入主舞台”“小组赛进行中”“赛事准备中”。
   - 副文案：解释当前观赛重点，不写教程。
   - 行动入口：观看下一场、打开数据榜、查看对阵图。
   - 关键数字：已完成比赛、待赛场次、参赛队伍、榜首 KDA/胜率等。

3. **Team Signal Map**
   - 以 SVG 雷达/多边形展示赛事强度感，不假装是严格战力模型。
   - 文案明确为“赛事信号图 / visual index”，不是官方排名。
   - 用已有状态、赛程、榜单数据生成静态摘要即可。

4. **Next Match**
   - 展示下一场可观看比赛：双方、阶段、时间、状态。
   - 无下一场时显示空态：赛事待排期 / 已结束。

5. **Hot Signals**
   - 展示热选手、近期表现、数据榜入口。
   - 使用图标化卡片，避免裸表格。

6. **Below-fold 三卡**
   - Bracket Path：把对阵路径做成图形入口。
   - Team Telemetry：用趋势线展示近期状态/榜单走势。
   - Data Gateway：跳到完整赛程、小组赛、对阵图、数据榜。

现有 tab 内容不删除，改为被这些模块承接。用户仍能进入完整赛程、小组赛、对阵图和数据榜。

## 5. 组件方案

新增目录建议：`src/components/tournament/arena/`

| 组件 | 职责 |
|---|---|
| `TournamentArenaView` | 替代 `PublicTournamentView` 的顶层编排；处理 loading/empty/state 分发 |
| `ArenaHud` | 顶部 HUD 状态条 |
| `ArenaHero` | 主舞台标题、行动入口、关键数字 |
| `TeamSignalMap` | SVG 雷达/信号图 |
| `NextMatchPanel` | 下一场比赛卡 |
| `HotSignalsPanel` | 热点选手/数据入口 |
| `BracketPathPreview` | 对阵路径视觉摘要 |
| `TeamTelemetryPanel` | 趋势/状态图 |
| `ArenaSectionTabs` | below-fold 完整内容切换，承载现有赛程/小组赛/对阵图/数据榜 |

样式可以先放在组件 `className` + `globals.css` 少量公开端工具类中。避免创建一套泛化设计系统；这是公开赛事页视觉语言，不是全站主题。

## 6. 数据与行为

数据来源沿用现有 `useTournamentState()`：

- `state.matches`：下一场、已完成/待赛数量、赛程入口、对阵路径。
- `state.standings`：小组/队伍状态摘要。
- `state.bracket`：淘汰赛路径。
- `LeaderboardView`：完整数据榜仍按现有组件加载。

派生逻辑应抽成纯函数，方便测试：

- `getNextMatch(matches, now)`：优先未完成且有 `scheduledAt` 的最近比赛；否则返回 null。
- `getArenaStats(state)`：输出比赛数量、参赛队伍数、完成进度等。
- `getHotSignals(state)`：第一阶段可用保守规则生成：下一场双方、近期已完成比赛、榜单入口；不要编造不存在的数据。
- `getTournamentHeadline(state)`：根据赛事状态和下一场生成标题/副文案。

错误和空态：

- loading：保持现有轻量加载，但使用 cockpit skeleton。
- 无赛事：展示公开空态，保留登录入口或返回首页入口。
- 数据不足：模块降级为 CTA，不显示伪数据。
- 移动端：Hero、Next Match、Hot Signals 顺序垂直堆叠；雷达图缩小或隐藏装饰背景，内容优先。

## 7. 视觉约束

- 主背景：深色 `#07111f` 附近，点阵/粒子/scanline 作为低对比装饰。
- 主信号色：cyan；辅助强调：amber；语义色只用于状态，避免全页彩虹。
- 字体：保留系统字体；可用 CSS 字重/大写/letter spacing 表达 HUD 感，不引入外链字体。
- 图标：优先 `lucide-react`；自定义 SVG 只用于雷达、对阵路径、粒子/轨道等页面级可视化。
- 卡片：允许科技边框和括角，但不要层层卡片嵌套。
- 文本不能遮挡图形；移动端禁用会影响阅读的背景特效。
- 不使用 emoji。

## 8. 测试与验收

自动验证：

- `npm run typecheck`
- 相关纯函数单测：`getNextMatch`、`getArenaStats`、`getTournamentHeadline`
- 组件 smoke test：无赛事、loading、有赛事三种状态

浏览器验收：

- 桌面：`/tournament` 首屏不是普通 tabs，而是 Tech Arena Console。
- 移动端：标题、按钮、下一场、热点卡片不重叠；按钮文字不溢出。
- 点击“观看下一场 / 查看对阵图 / 数据榜”能到达对应内容区或页面。
- 无赛事/无下一场时不显示假数据。
- 现有赛程、小组赛、对阵图、数据榜仍可访问。

## 9. 分阶段实施

第一阶段：

1. 新增 arena 纯函数和单测。
2. 新增 arena 组件壳，接入现有 `useTournamentState()`。
3. 替换 `PublicTournamentView` 顶层渲染为 `TournamentArenaView`。
4. 保留完整内容 tabs 作为 below-fold。
5. 跑 typecheck、单测、Playwright 截图验证桌面/移动端。

第二阶段可选：

- Atlas 扩展皮肤：将同一信息架构映射为暗棕/铜色、星图/轨道/相位语言。
- 将同一视觉语言扩展到 `/live`。
- 为选手详情页增加同风格入口卡或轻量 HUD。
- 若公开首页也要强品牌感，再做 `/` 到 `/tournament` 的视觉衔接。

## 10. Atlas 皮肤预留

Atlas 是后续皮肤，不是当前实现的一部分。当前实现要避免把结构写死到 Tech Console：

- 组件命名使用语义名，如 `ArenaHero`、`NextMatchPanel`、`BracketPathPreview`，不使用 `CyberHero`、`CyanPanel` 这类主题名。
- 颜色通过局部 CSS 变量表达，如 `--arena-bg`、`--arena-accent`、`--arena-panel`。第一阶段变量值是 cyan/amber cockpit；Atlas 皮肤以后可替换为 amber/copper 星图。
- 可视化组件接收数据和文案，不依赖固定装饰。Tech 版可以画雷达/信号图，Atlas 版以后可画轨道/星图。
- 第一阶段不做主题开关、不做用户选择、不做后台配置，避免为了未来皮肤增加复杂度。

## 11. 风险

- 视觉过强会损害可读性：通过移动端降级、低对比装饰、内容优先规避。
- 数据不足导致页面空洞：模块必须支持空态和 CTA，不编造战力/热度。
- 样式污染后台：arena 样式限定在公开赛事组件，不全局替换 shadcn token。
- 未来 Atlas 皮肤需求会诱导过早抽象：第一阶段只保留变量和语义组件名，不实现皮肤系统。
