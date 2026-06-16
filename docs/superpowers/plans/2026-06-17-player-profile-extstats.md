# Player Profile Extended Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the public player detail page so imported LCU settlement data in `GamePlayerStat.extStats` becomes readable: six-dimensional hexagon chart, safe first-version charts, extended averages/totals, highlight-event cards, per-game extended details, and full raw fields.

**Architecture:** Keep `extStats Json?` as the storage boundary. Normalize JSON in `player-stats-service`, return complete raw stats only from the single-player API, and keep leaderboard payloads summary-only. The UI renders stable basic stats first, then optional extended blocks that degrade cleanly when old hand-entered games lack `extStats`.

**Tech Stack:** Next.js App Router, Prisma JSON fields, React client components, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Add Extended Stat Normalization and Aggregation

**Files:**
- Modify: `src/lib/tournament/player-stats-service.ts`
- Modify: `src/lib/tournament/player-stats-service.test.ts`

- [ ] Add failing tests in `player-stats-service.test.ts`:
  - `it('聚合 extStats 扩展字段并保留基础统计口径')`
  - `it('旧手录局无 extStats 时只影响扩展覆盖场次')`
  - `it('extStats 字段类型异常时不抛错')`
  - `it('为六边形能力图计算赛事内 0-100 相对分')`
  - `it('为趋势图输出归一化伤害与视野序列')`
  - `it('计算每场物理魔法真实伤害构成')`
- [ ] In tests, create games with `saveGameDetail`, then update selected `gamePlayerStat` rows with `extStats` via `testDb.gamePlayerStat.updateMany` or `update`.
- [ ] Add exported or testable types:
  - `NormalizedExtStats`
  - `PlayerExtendedAverages`
  - `PlayerExtendedTotals`
  - `PlayerRadarScores`
  - `PlayerGameExtended`
- [ ] Add `normalizeExtStats(extStats)` that accepts only object JSON and safely extracts:
  - economy: `goldSpent`, `neutralMinionsKilledTeamJungle`, `neutralMinionsKilledEnemyJungle`
  - output: `totalDamageDealtToChampions`, `physicalDamageDealtToChampions`, `magicDamageDealtToChampions`, `trueDamageDealtToChampions`, `damageDealtToObjectives`, `damageDealtToTurrets`
  - survival: `totalDamageTaken`, `physicalDamageTaken`, `magicalDamageTaken`, `trueDamageTaken`, `damageSelfMitigated`, `longestTimeSpentLiving`
  - vision: `visionScore`, `wardsPlaced`, `wardsKilled`, `visionWardsBoughtInGame`, `sightWardsBoughtInGame`
  - tempo/highlights: `firstBloodKill`, `firstBloodAssist`, `firstTowerKill`, `firstTowerAssist`, `firstInhibitorKill`, `firstInhibitorAssist`, `turretKills`, `inhibitorKills`
  - multikill/control: `doubleKills`, `tripleKills`, `quadraKills`, `pentaKills`, `unrealKills`, `largestMultiKill`, `largestKillingSpree`, `killingSprees`, `totalHeal`, `timeCCingOthers`, `totalTimeCrowdControlDealt`
  - per-game display: `champLevel`, `spell1Id`, `spell2Id`, `item0` through `item6`, `perk0` through `perk5`, `perkPrimaryStyle`, `perkSubStyle`
- [ ] Add `computeExtendedStats(rows)`:
  - basic `summary` still uses every official `GamePlayerStat` row
  - `extended.sourceGames` counts only rows whose normalized `extStats` is not null
  - extended averages divide by `sourceGames`, not total games
  - totals sum booleans as event counts
  - max values use `null` when no source rows exist
- [ ] Add radar score calculation:
  - Compute raw per-player dimension averages for players with extension coverage.
  - Convert each dimension to a current-tournament percentile score from 0 to 100.
  - Use these six dimension keys: `output`, `economy`, `vision`, `survival`, `objective`, `teamfight`.
  - For survival, combine lower deaths with higher mitigation/taken values so lower deaths improve the score.
- [ ] Add chart-safe derived data:
  - `extended.trends.damagePercentile` and `extended.trends.visionPercentile` per game, both 0-100.
  - `game.extended.damageComposition` with physical/magic/true values and percentages.
  - No event timestamps and no epic-monster damage peaks; these fields do not exist in the current capture payload.
- [ ] Update `getPlayerTournamentStats` and `listPlayerTournamentProfiles` to attach:
  - `stats.extended.averages`
  - `stats.extended.totals`
  - `stats.extended.radar`
  - `stats.extended.trends`
  - `stats.extended.sourceGames`
  - `game.extended`
- [ ] Run:

```bash
npm test -- src/lib/tournament/player-stats-service.test.ts
```

### Task 2: Split Single-Player Raw Payload From Leaderboard Summary Payload

**Files:**
- Modify: `src/lib/tournament/player-stats-service.ts`
- Modify: `src/app/api/tournament/public/player/[playerId]/route.ts`
- Modify: `src/app/api/tournament/public/leaderboard/route.ts`
- Modify: `src/lib/tournament/player-stats-service.test.ts`

- [ ] Add a service option:

```ts
type PlayerStatsOptions = {
  includeRawStats?: boolean;
};
```

- [ ] Make `getPlayerTournamentStats(db, playerId, tournamentId, { includeRawStats: true })` include `game.extended.rawStats`.
- [ ] Make the default option omit `rawStats` so `listPlayerTournamentProfiles` stays lightweight.
- [ ] Update `GET /api/tournament/public/player/[playerId]` to pass `{ includeRawStats: true }`.
- [ ] Keep `GET /api/tournament/public/leaderboard` on the default summary payload.
- [ ] Add assertions:
  - single-player result includes unknown keys inside `game.extended.rawStats`
  - leaderboard profiles do not include `rawStats`
- [ ] Run:

```bash
npm test -- src/lib/tournament/player-stats-service.test.ts
```

### Task 3: Build the Player Detail UI Extension

**Files:**
- Modify: `src/components/tournament/PlayerStatsView.tsx`
- Add: `src/components/tournament/PlayerStatsView.test.tsx`

- [ ] Add component tests:
  - renders six radar labels and scores when `extended.radar.sourceGames > 0`
  - shows the short empty state when `sourceGames === 0`
  - renders a small-sample note when radar source data is sparse
  - renders normalized output/vision trend only when at least 3 games have source values
  - renders damage composition bars from physical/magic/true damage
  - renders extension coverage text like `扩展数据覆盖 2/3 局`
  - renders high-highlight cards as a section independent from recent games
  - does not render a highlight timeline or hard-coded event timestamps
  - expands a game row and shows items, spells, vision/output/survival details
  - raw stats disclosure includes an unknown key from `rawStats`
- [ ] Extend local component types to match service types instead of hand-maintaining only the old summary shape.
- [ ] Add a `RadarHexagon` subcomponent implemented with inline SVG:
  - fixed `viewBox`
  - six stable axis labels
  - one polygon from 0-100 values
  - no external chart dependency
  - empty state when no score data exists
  - sample-size warning when `sourceGames < 3` or comparison sample is too small
- [ ] Add a `NormalizedTrendChart` subcomponent:
  - uses already-normalized 0-100 damage/vision values
  - labels that these are percentile scores, not raw damage and raw vision on one axis
  - degrades to per-game number chips when fewer than 3 source games exist
- [ ] Add a `DamageCompositionChart` subcomponent:
  - stacked bars for physical/magic/true champion damage
  - per-row total damage label
  - handles zero total by showing an empty state instead of dividing by zero
- [ ] Add `ExtendedOverview`:
  - output: average champion/objective/turret damage
  - economy: average gold spent, team jungle CS, enemy jungle CS
  - vision: average vision score, wards placed, wards killed, control wards
  - survival/control: average taken, mitigated, healing, CC time
- [ ] Add `HighlightEvents` as full-width cards:
  - first blood kills/assists
  - turret/inhibitor kills
  - double/triple/quadra/penta totals
  - largest multi-kill and largest killing spree
  - no event time labels; current LCU match-history stats only provide booleans/counts
- [ ] Extend `GamesTable`:
  - preserve current compact row columns
  - add an expand/collapse control per game
  - expanded area shows items, spells, champion level, vision, output, survival, objective data
  - raw JSON disclosure is sorted by key and defaults closed
- [ ] Ensure old data degrades cleanly:
  - no `extended` object: show existing basic page plus empty extended state
  - `extended.sourceGames === 0`: no fake 0-score chart
- [ ] Do not implement the postponed charts in this task:
  - no heatmap unless a single metric and legend are explicitly added later
  - no highlight timeline until `lol-capture` stores timeline API data
- [ ] Run:

```bash
npm test -- src/components/tournament/PlayerStatsView.test.tsx
```

### Task 4: Keep Leaderboard Explorer Compatible

**Files:**
- Modify only if type or render failures require it:
  - `src/components/tournament/LeaderboardView.tsx`
  - `src/components/tournament/LeaderboardView.test.tsx`

- [ ] Run existing leaderboard tests after service shape changes:

```bash
npm test -- src/components/tournament/LeaderboardView.test.tsx
```

- [ ] If `LeaderboardView` needs type updates, keep it on summary fields and do not render raw per-game JSON in the leaderboard page.
- [ ] Preserve existing player switching, search, common champions, recent form, and match links.

### Task 5: Verify the Full Feature

**Files:**
- Modify only files from Tasks 1-4 unless a local type import fix is required.

- [ ] Run focused tests:

```bash
npm test -- src/lib/tournament/player-stats-service.test.ts src/components/tournament/PlayerStatsView.test.tsx src/components/tournament/LeaderboardView.test.tsx
```

- [ ] Run full validation:

```bash
npm run typecheck
npm test -- src/lib/tournament/import-commit.test.ts src/lib/tournament/player-stats-service.test.ts src/components/tournament/PlayerStatsView.test.tsx src/components/tournament/LeaderboardView.test.tsx
```

- [ ] Start the app and inspect `/tournament/player/[playerId]` with data that has `extStats`:

```bash
npm run dev
```

- [ ] Browser-check desktop and mobile widths:
  - six-dimensional hexagon is visible and labels do not overlap
  - highlight cards form a full-width section
  - expanded game details do not force horizontal overflow on mobile
  - raw fields are available but closed by default
- [ ] Commit only implementation files and this plan. Do not include `docs/superpowers/mockups/player-profile-extstats.html` unless the user explicitly wants the mockup versioned.
