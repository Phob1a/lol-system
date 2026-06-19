# 选手详情页重构 · 公开观赛/粉丝向 (设计稿)

- 日期: 2026-06-19
- 作者: Claude Code 二号机
- 评审: Codex二号机 (设计级已过, 代码级终审待做)
- 定调人: 代立轩
- 状态: 已锁定范围, 待实现

## 1. 背景与目标

`src/components/tournament/PlayerStatsView.tsx`(约 460 行, 全手搓 SVG) 是当前选手详情页主视图。
现状是"把所有数据摊开的分析表": 核心卡 + 手搓雷达 + 手搓趋势线 + 伤害构成条(仅最近 5 场) +
高光事件(6 项混排) + 扩展概览裸数字卡 + 逐场可展开(含原始 extStats JSON 全量下发)。

目标: 改成**公开观赛/粉丝向的选手主页**。原则:
- 重观感、看点、英雄池、高光; 弱化裸数字与原始字段。
- 把后端已算但页面没渲染的数据(`recentForm`/`commonChampions`)推到前台。
- 图表从手搓 SVG 迁移到 Recharts, 保证可读性(刻度/tooltip/空态/小样本提示)不为"华丽"牺牲。
- 把 460 行大组件拆开, Recharts 只进图表子组件。

受众已确认为 A(公开观赛/粉丝向)。

## 2. 最终信息架构 (锁定)

1. **Hero 横幅**
   - 昵称 / 战队 / 位置; 头像用 首字母 + 战队色 + 位置徽章占位(schema 无真人头像字段, 不假装支持)。
   - 核心高光大字: 胜率、KDA、MVP(同时显示**次数**与**MVP率** = mvpCount/games)、**参团率 KP**。
   - 最近 8 场 W/L 彩色胶囊(`recentForm`, 后端已有, 之前未渲染)。
   - **角色定位标签**(新增 item 2): 从雷达维度推一个身份词(输出核心/坦克/视野型/团战型/均衡型)。
2. **招牌英雄池 + 代表作短卡**
   - `commonChampions`(后端已有, 之前未渲染): 英雄头像 + 场次 + 胜率 + KDA。
   - 代表作短卡: 从 `games` 挑 MVP 局 / 最高 KDA 局 / 最高伤害局之一, 突出"一局打爆"。
3. **生涯纪录区**(新增 item 1+3)
   - 单场纪录墙: 最高单场伤害 / 单场最多击杀 / 单场最高 KDA / 最长存活(`extended.totals.longestTimeSpentLiving`)。
   - 最长连胜: 赛事内最长连胜场数。
4. **能力雷达 + 表现趋势**(二级分析区, 不抢横幅/英雄池视觉权重)
   - 雷达: 6 维, 明确标注为"**赛事内分位 (0-100)**", 只画 50 分位参考环, **不暗示赛事均值曲线**
     (服务返回的是 percentile, 非原始值+均值; 真均值曲线需后端补 benchmark, 本次不做)。保留 `sampleSizeWarning`。
   - 趋势: 输出/视野分位 AreaChart, **y 轴固定 0-100**, 保留点位 + tooltip; 少于 3 场沿用现有 fallback(不硬画平滑)。
5. **高光徽章墙**(改: 拆两档)
   - 稀有高光在前: 五杀/四杀/三杀、最高连杀。
   - 参与高光在后: 首杀参与、首塔参与、推塔。
   - 文案用"累计高光徽章", **不写"高光时间线"**(数据只有次数/最大值, 无时间)。
6. **逐场战绩**(弱化)
   - 轻量行: 英雄图标 + KDA + 胜负; 点开看 curated 单局详情。
   - **伤害构成降级到此处单局详情**(单局语境下描述"这局怎么输出的", 不占主版面)。
   - 原始 extStats JSON: 公开页默认不下发, 仅 `?debug=1` 返回。

### 砍掉 / 不做
- "扩展概览"整排裸数字卡(承伤/减免/插眼/排眼…)不再单独占主版面, 相关信息融进雷达与逐场详情。
- 场均金币/补刀在粉丝向弱化。
- 伤害构成主版面环形图、战斗风格(伤害/承伤/治疗)可视化 —— 均不做。
- item 4(硬控 ccTime/真眼)、item 5(打野反野) —— 本次不做。
- 真人头像、对线经济差、伤害时间线/分钟级曲线 —— 数据不支持, 不做。

## 3. 后端改动 (`src/lib/tournament/player-stats-service.ts` + public route)

1. **原始字段收口**(Codex 验收点): public route 默认 `includeRawStats: false`,
   仅当请求带 `?debug=1` 时才 `includeRawStats: true`。
   `src/app/api/tournament/public/player/[playerId]/route.ts` 读取 query 决定。
2. **参团率 KP**(新增 item 6): raw 无 Riot `killParticipation`(捕获的是 LCU 扁平 stats);
   `GameTeamStat` 无全队英雄击杀字段。但导入强制全队 10 人映射, 每局每名 `GamePlayerStat` 都带 `kills`+`teamId`。
   - 在 service 查询时按 `(gameId, teamId)` 聚合同队 5 人 `kills` 之和 = 该局全队总击杀。
   - 单局 KP = (个人 kills + assists) / 全队总击杀(全队总击杀为 0 时记为 null)。
   - 赛事 KP = 有效局的均值, 输出到 `summary`(或新增字段), 保留 1 位小数百分比。
3. **生涯纪录 + 最长连胜**: 在 service 计算并新增字段(便于单测, 保持视图无业务逻辑):
   - `careerHighs`: { maxDamageGame, maxKillsGame, maxKdaGame, longestTimeSpentLiving } —— 各含对局标签与数值。
   - `bestWinStreak`: number —— 从按时间排序的对局序列求最长连胜。
   - (备注: `games` 服务层已按 `match.scheduledAt desc, game.index desc` 排序, 倒序求连胜即可。)
4. **角色定位标签**: 从 `extended.radar` 各维分位推导(取最高维或规则映射), service 输出 `roleTag` 字符串;
   分位缺失(扩展数据为 0)时返回 null, 前端不显示标签。

> `recentForm`、`commonChampions` 已在服务层返回, 无需后端改动, 仅前端渲染。

## 4. 前端结构 (组件拆分)

把 `PlayerStatsView.tsx` 拆为容器 + 子组件, Recharts 只进图表子组件:
- `PlayerStatsView.tsx`: 仅做布局编排(各 section 顺序)。
- `PlayerHero.tsx`: 横幅(身份 + 核心高光大字 + W/L 胶囊 + 角色标签)。
- `PlayerChampionPool.tsx`: 英雄池 + 代表作短卡。
- `PlayerCareerHighs.tsx`: 生涯纪录墙 + 最长连胜。
- `PlayerCharts.tsx`: 雷达 + 趋势(Recharts; client component; 可 dynamic import below-fold)。
- `PlayerHighlights.tsx`: 高光徽章墙(两档)。
- `PlayerMatchLog.tsx`: 逐场战绩(轻量行 + 单局详情, 含伤害构成 + debug raw)。

页面壳与各组件均为 client component(现状已是 `'use client'` + `useEffect fetch`), Recharts 不撞 server component。
图表抽到 `PlayerCharts.tsx` 控制 bundle, 必要时 `next/dynamic` 懒加载。

## 5. 视觉

- 配色: 深色渐变 Hero 横幅 + 玻璃拟态卡片 + win/loss 语义色(emerald/rose)。
- 动效: 数字滚动入场、图表渐入(克制, 不伤可读性)。
- Recharts: RadarChart / AreaChart; 统一主题(色板、字号、tooltip 样式)。

## 6. Codex 终审验收点 (实现须满足)

1. 公开 API 默认不带 raw, 仅 `?debug=1` 才传 `rawStats`。
2. 雷达文案/图形只表达"赛事内分位", 不暗示赛事均值。
3. 趋势/伤害构成的小样本与空态不误导(<3 场 fallback; 整体构成按全部有数据局汇总, 不拿局部冒充整体)。
4. `PlayerStatsView` 拆分后边界清楚, Recharts 只进图表组件, 主视图不再堆大。

## 7. 测试

- service 单测: KP 聚合(含全队 0 击杀边界)、careerHighs、bestWinStreak、roleTag(分位缺失→null)、
  `includeRawStats` 开关。复用现有 `player-stats-service.test.ts` 模式。
- 组件: 沿用 `PlayerStatsView.test.tsx`, 补空态/小样本快照。
- 端到端: 现有 player profile 页加载冒烟。

## 8. 风险

- KP 聚合增加查询成本(需多拉同局队友 kills); 按比赛规模可接受, 必要时一次性按 gameId 批量取。
- Recharts 进 bundle; 用组件隔离 + 懒加载控制。
- 小样本(<3 场/对比选手<4)下分位与趋势仅供参考, 保留 `sampleSizeWarning` 文案。
