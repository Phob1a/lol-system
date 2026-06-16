# 选手详情页全量数据扩展设计

- 日期：2026-06-17
- 关联：`docs/superpowers/specs/2026-06-17-match-import-design.md`、`docs/superpowers/specs/2026-06-16-player-profile-leaderboard-design.md`

## 1. 背景与目标

`lol-capture` 已能从国服 LCU 抓到 10 名选手的完整结算字段，并在导入设计中把每名选手的原始 `stats`、召唤师技能、英雄数字 ID 等写入 `GamePlayerStat.extStats`。用户要求选手详情页支持本话题记录的所有信息。

这里的本质目标不是把 100 多个 LCU key 平铺成表格，而是：

1. 让观众能快速看懂选手表现。
2. 让管理员和后续开发能查到完整原始字段。
3. 不破坏现有排行榜的稳定口径。

因此采用“两层结合”：

- 主界面展示可解释、可聚合的表现数据。
- 每场记录保留完整 `extStats` 折叠区，保证字段不丢。

## 2. 非目标

- 不新增 `game_player_stats` 的字段列。`extStats JSONB` 已是为“先全存，后决定口径”准备的扩展点。
- 不把所有 LCU 字段纳入排行榜排序。排行榜仍使用现有稳定列：K/D/A、CS、伤害、金币、MVP、胜负。
- 不在本期解释符文、装备和召唤师技能的中文名称映射；先展示 ID，后续可接静态资源映射。
- 不做跨赛事生涯聚合。沿用当前选手页“当前赛事”口径。

## 3. 数据来源

现有正式统计：

- `GamePlayerStat.kills`
- `deaths`
- `assists`
- `cs`
- `damage`
- `gold`
- `championId`
- `Game.winnerTeamId`
- `Game.mvpRegistrationId`

导入后扩展统计：

- `GamePlayerStat.extStats`

`extStats` 由导入 commit 写入，内容来自 `summary.players[].stats`，并包含便利字段：

- 原始数字 `championId`
- 抓取到的 `championName`
- `spell1Id`
- `spell2Id`

旧手录数据可能没有 `extStats`。页面必须降级显示基础数据，不报错、不显示空噪音。

## 4. 字段分组

从当前真实夹具 `sample-summary-with-pid.json` 看，LCU stats 至少覆盖以下类型。

### 4.1 核心

继续显示在头部和逐场表：

- `kills`
- `deaths`
- `assists`
- `win`
- `champLevel`
- `championName`
- `spell1Id`
- `spell2Id`

### 4.2 经济与发育

聚合为场均和逐场明细：

- `goldEarned`
- `goldSpent`
- `totalMinionsKilled`
- `neutralMinionsKilled`
- `neutralMinionsKilledTeamJungle`
- `neutralMinionsKilledEnemyJungle`

页面展示：

- 场均金币
- 场均花费
- 场均 CS
- 场均己方野怪
- 场均敌方野怪

### 4.3 输出

聚合为总量、场均、占比：

- `totalDamageDealtToChampions`
- `physicalDamageDealtToChampions`
- `magicDamageDealtToChampions`
- `trueDamageDealtToChampions`
- `totalDamageDealt`
- `damageDealtToObjectives`
- `damageDealtToTurrets`

页面展示：

- 场均对英雄伤害
- 物理/魔法/真实伤害构成
- 场均目标伤害
- 场均防御塔伤害

### 4.4 承伤与生存

聚合为场均：

- `totalDamageTaken`
- `physicalDamageTaken`
- `magicalDamageTaken`
- `trueDamageTaken`
- `damageSelfMitigated`
- `longestTimeSpentLiving`

页面展示：

- 场均承伤
- 场均自我减免
- 最长存活时间最大值

### 4.5 视野

聚合为场均和逐场：

- `visionScore`
- `wardsPlaced`
- `wardsKilled`
- `visionWardsBoughtInGame`
- `sightWardsBoughtInGame`

页面展示：

- 场均视野分
- 场均插眼
- 场均排眼
- 场均真眼购买

### 4.6 目标与节奏

逐场展示，不强行做排行榜：

- `firstBloodKill`
- `firstBloodAssist`
- `firstTowerKill`
- `firstTowerAssist`
- `firstInhibitorKill`
- `firstInhibitorAssist`
- `turretKills`
- `inhibitorKills`

页面展示：

- 首杀/首塔/首水晶徽标
- 推塔/水晶数量

### 4.7 连杀与多杀

聚合总次数和最高值：

- `doubleKills`
- `tripleKills`
- `quadraKills`
- `pentaKills`
- `unrealKills`
- `largestMultiKill`
- `largestKillingSpree`
- `killingSprees`

页面展示：

- 双杀/三杀/四杀/五杀总次数
- 最高多杀
- 最大连杀

### 4.8 治疗与控制

聚合为场均：

- `totalHeal`
- `totalUnitsHealed`
- `timeCCingOthers`
- `totalTimeCrowdControlDealt`

页面展示：

- 场均治疗
- 场均控制时间

### 4.9 装备与符文

默认逐场展示，不做聚合：

- `item0` 到 `item6`
- `perk0` 到 `perk5`
- `perkPrimaryStyle`
- `perkSubStyle`
- `perk*Var*`

页面展示：

- 每场装备 ID 列表
- 每场符文 ID 折叠显示

### 4.10 模式专属字段

保留在原始字段区：

- `playerAugment1` 到 `playerAugment6`
- `subteamPlacement`
- `playerSubteamId`
- `roleBoundItem`
- `playerScore0` 到 `playerScore9`
- `wasSevereTransgressor`
- surrender 相关字段

这些字段和模式强绑定，默认主界面不解释。若后续明确要支持 Arena 或特殊模式，再独立定义展示口径。

### 4.11 六边形能力图

用户明确希望选手详情页有“六边形”表现图。能力图只做解释性展示，不参与排行榜排序，避免把临时口径变成竞技结论。

六个维度：

- 输出：`totalDamageDealtToChampions`、`damageDealtToObjectives`、`damageDealtToTurrets`
- 经济：`goldEarned`、`totalMinionsKilled`、`neutralMinionsKilled`
- 视野：`visionScore`、`wardsPlaced`、`wardsKilled`、`visionWardsBoughtInGame`
- 生存：低死亡、`totalDamageTaken`、`damageSelfMitigated`
- 目标：`turretKills`、`inhibitorKills`、首塔/首水晶参与
- 团战：KDA、`timeCCingOthers`、多杀/连杀

归一化规则：

- 只使用有 `extStats` 的局。
- 每个维度先算该选手场均原始指标，再在当前赛事有扩展数据的选手集合内按百分位映射到 0-100。
- `sourceGames = 0` 时不画假六边形，显示“暂无扩展数据”。
- 这是相对赛事内表现，不是官方评分；UI 文案必须避免“综合实力”这类绝对表述。

## 5. 后端设计

扩展 `src/lib/tournament/player-stats-service.ts`。

### 5.1 类型

新增：

```ts
type PlayerExtendedAverages = {
  avgGoldSpent: number | null;
  avgTeamJungleCs: number | null;
  avgEnemyJungleCs: number | null;
  avgObjectiveDamage: number | null;
  avgTurretDamage: number | null;
  avgDamageTaken: number | null;
  avgDamageMitigated: number | null;
  avgVisionScore: number | null;
  avgWardsPlaced: number | null;
  avgWardsKilled: number | null;
  avgControlWardsBought: number | null;
  avgHealing: number | null;
  avgCcTime: number | null;
};

type PlayerExtendedTotals = {
  firstBloodKills: number;
  firstBloodAssists: number;
  turretKills: number;
  inhibitorKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestMultiKill: number | null;
  largestKillingSpree: number | null;
  longestTimeSpentLiving: number | null;
};

type PlayerRadarScores = {
  sourceGames: number;
  output: number | null;
  economy: number | null;
  vision: number | null;
  survival: number | null;
  objective: number | null;
  teamfight: number | null;
};

type PlayerGameExtended = {
  championLevel: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  goldSpent: number | null;
  visionScore: number | null;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWardsBought: number | null;
  damageTaken: number | null;
  damageMitigated: number | null;
  objectiveDamage: number | null;
  turretDamage: number | null;
  items: number[];
  rawStats: Record<string, unknown> | null;
};
```

挂到现有返回结构：

- `PlayerTournamentStats.extended`
- `PlayerGameRow.extended`

### 5.2 读取与归一化

新增纯函数：

- `normalizeExtStats(extStats: Prisma.JsonValue | null): NormalizedExtStats | null`
- `computeExtendedStats(rows): { averages, totals }`
- `computeRadarScores(profiles): Map<registrationId, PlayerRadarScores>`

规则：

- 字段不存在或类型不是 number/bool 时返回 `null` 或 0，不抛错。
- 平均值只对有 `extStats` 的局计算，并返回 `sourceGames`，避免旧手录局把场均拉低。
- 六边形能力图用赛事内百分位归一化；无扩展数据的选手各维度返回 `null`，不强行补 0。
- `rawStats` 保留原始对象，但只在单场明细中返回，不参与聚合。

### 5.3 兼容旧数据

若选手有 10 局，其中 6 局手录、4 局导入：

- 基础 summary 仍按 10 局算。
- extended averages 只按 4 局算，并在 UI 标注“扩展数据覆盖 4/10 局”。
- 无 `extStats` 的逐场记录显示“无扩展数据”。

## 6. 前端设计

扩展 `src/components/tournament/PlayerStatsView.tsx`。

### 6.1 页面结构

保留现有头部和逐场记录，新增三个区域：

1. **六边形能力图**
   - 输出、经济、视野、生存、目标、团战六维 0-100
   - 放在稳定核心数据之后、扩展概览之前
   - 能力图旁边展示覆盖场次，例如“扩展数据覆盖 4/10 局”
   - 无扩展数据时显示短空态，不渲染 0 分多边形

2. **扩展概览**
   - 输出：场均英雄伤害、目标伤害、防御塔伤害
   - 视野：场均视野分、插眼、排眼、真眼
   - 生存：场均承伤、减免、最长存活
   - 经济：场均花费、野怪

3. **高光事件**
   - 首杀、首塔、推塔、水晶、多杀次数
   - 最高多杀、最大连杀
   - 使用整行卡片组展示，不塞进窄侧栏；数值和事件名分层，避免大数字挤压标签

4. **逐场扩展**
   - 每场表格在现有 K/D/A 后增加可展开行
   - 展开后显示装备、技能、视野、输出细分、承伤、目标数据
   - 底部再加“原始字段”折叠区，按 key 排序显示完整 `rawStats`

### 6.2 UI 约束

- 主界面不展示 100+ 字段。
- 原始字段必须可查，默认收起。
- 移动端逐场扩展用纵向字段组，不做超宽表格。
- `extStats` 缺失时使用短空态，不显示一堆 0。
- 六边形可以用原生 SVG 实现，不为单个图形引入新图表依赖。

## 7. API

`GET /api/tournament/public/player/[playerId]` 返回已有 `stats`，形状扩展但保持向后兼容。

`GET /api/tournament/public/leaderboard` 不必返回每场 rawStats。榜单页只需要 profile explorer 的概要和最近比赛；为避免一次加载过大，`rawStats` 只在单选手详情 API 返回。

如果当前 leaderboard 组件复用 `PlayerStatsView` 的类型，前端类型要拆开：

- `PlayerProfileSummary`：榜单/切换器用，不含 `rawStats`
- `PlayerTournamentStats`：单人详情用，含逐场 `rawStats`

## 8. 测试

### 8.1 Service

覆盖：

- 有 `extStats` 时正确计算视野、承伤、目标伤害、多杀、装备。
- 旧手录局无 `extStats` 时基础统计不变，扩展覆盖场次正确。
- 非 number 字段不抛错。
- 六边形维度只使用有扩展数据的局，并在赛事内归一化到 0-100。
- `rawStats` 只在单人详情返回，不进入 leaderboard 批量 payload。

### 8.2 Component

覆盖：

- 扩展概览显示覆盖场次。
- 六边形能力图显示六维标签；无扩展数据时显示空态。
- 无 `extStats` 时显示空态。
- 逐场扩展可展开，展示装备/视野/输出。
- 原始字段折叠区包含未知 key。

## 9. 实施顺序

1. 扩展 service 类型和纯函数，先加测试。
2. 扩展单选手 API 返回完整 extended/rawStats。
3. 调整 leaderboard API，避免批量返回 rawStats。
4. 扩展 `PlayerStatsView` UI。
5. 视需要调整 `LeaderboardView` 类型引用，保持现有榜单体验不退化。

## 10. 风险

- `extStats` 写入路径当前仍在 match import 实现中推进。如果 commitImport 尚未完成，本设计可先落 service/UI，但页面只能在导入完成后看到扩展数据。
- LCU 字段不是官方稳定契约。新增字段不应导致页面失败；未知字段只进入 rawStats。
- `rawStats` 体积大，不能在 leaderboard 批量接口里全量返回。
