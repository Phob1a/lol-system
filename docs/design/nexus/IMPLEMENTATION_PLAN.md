# NEXUS — Implementation Plan (Claude Code执行落地方案)

Target repo: **`lol-system`** — Next.js (App Router) · TypeScript · shadcn/ui (Radix +
Tailwind, "new‑york", slate base) · Prisma · NextAuth. This plan recreates the NEXUS
prototype (see `README.md` + `prototype/`) inside that stack **without** rewriting the
data layer — reuse existing `src/lib/*`, `src/hooks/*`, API routes and Prisma models.

> How to use: work top‑to‑bottom. Each task is a self‑contained PR‑sized unit with
> concrete file targets and an acceptance check. Don't ship the HTML — port it.

---

## Phase 0 — Theme foundation
**Goal:** two retintable themes + global primitives, driven by CSS variables.

- [ ] **0.1 Tokens.** In `src/app/globals.css` add `:root[data-style="command"]` and
  `:root[data-style="celestial"]` blocks with every token from README → Design Tokens
  (as `--bg: 8 13 20;` channel triplets). Add `--font-display/-body/-mono/-serif`.
- [ ] **0.2 Tailwind.** Extend `tailwind.config.ts` `theme.colors` to map
  `bg/surface/panel/line/ink/dim/faint/accent/accent-2/good/bad/gold/hot` →
  `rgb(var(--x) / <alpha-value>)`. Keep existing shadcn tokens intact.
- [ ] **0.3 Fonts.** Load Saira, Saira Condensed, Newsreader, Space Mono, JetBrains Mono,
  Noto Sans/Serif SC via `next/font/google` in `src/app/layout.tsx`; expose as the CSS
  vars above.
- [ ] **0.4 Theme provider.** New `src/components/layout/ThemeStyleProvider.tsx` (client):
  holds `style: 'command'|'celestial'`, writes `data-style` on `<html>`, persists to
  `localStorage('nexus.style')`. Add a `ThemeSwitch` segmented control to the app shell.
  *(Reference `prototype/theme.js`.)*
- **Accept:** toggling the switch retints an existing page; no shadcn regressions.

## Phase 1 — Shared primitives & charts
**Goal:** the reusable layer every screen needs. Put in `src/components/nexus/`.

- [ ] **1.1 Surfaces.** `Panel`, `PanelHead`, `Tile`/`DTile`, `Chip`, `Kicker`,
  `Readout`, themed `Button`/`Field` — port `prototype/console.css` `.panel/.frame/.tile/
  .chip/.btn/.field` incl. per‑`data-style` structure (cut corners, brackets, scanlines,
  corner ticks) and the orange `--hot` live accents. Prefer Tailwind classes + a small
  `nexus.css` for the pseudo‑element structure.
- [ ] **1.2 Charts (SVG → TSX).** Port one‑to‑one, typed props, no chart lib:
  `PlayerRadar`, `HexRadar`, `CompareRadar`, `WinDonut`, `Sparkline`, `SegBudget`,
  `GroupBars`, `ChampBars`, `ChampHeat`, `MetaDonut`, `SeasonTrend`, `TrajectoryLine`,
  `BracketMap`, `Orrery`, `MoonPhase`, `FormDots`, `Countdown`.
  Sources: `prototype/sig.jsx`, `lolcharts.jsx`, `pubextra.jsx`.
- [ ] **1.3 PosPip + ChampAvatar.** `PosPip` from `POS_CHAR`. **`ChampAvatar`: replace the
  monogram with the real portrait** from `src/data/champions.json` (fallback monogram if
  missing). Hexagon clip under `data-style=command`, circle under `celestial`.
- [ ] **1.4 HoverCard.** Port `prototype/cards.jsx` HoverCard (clone‑child + portal,
  debounced, viewport‑flip) + `PlayerHoverCard` / `TeamHoverCard` bodies. Consider Radix
  `HoverCard` for a11y, but keep the custom mini‑file layout.
- [ ] **1.5 Starfield (optional).** Port `prototype/starfield.js` as a mounted client
  canvas in the shell; expose `refreshColors()` to the theme switch. Respect
  `prefers-reduced-motion`.
- **Accept:** a Storybook/page renders all primitives in both themes.

## Phase 2 — Data adapters
**Goal:** feed components from real data, not the mock.

- [ ] **2.1 Selectors.** Map Prisma/`src/lib/*` outputs to the prop shapes the ported
  components expect (profile summary, standings rows, team agg, match box score).
  Reuse `src/lib/players`, `src/lib/teams`, `src/lib/tournament`, `src/lib/draft`,
  `src/lib/costs`.
- [ ] **2.2 Match box score.** The prototype *synthesizes* per‑game stats from `match.id`.
  In production, source real `Game` rows; keep `prototype/matchdetail.jsx::buildMatch` only
  as a fallback for fixtures without recorded games.
- [ ] **2.3 Live.** Wire draft + status screens to `src/hooks/useDraftStream.ts` and
  `useTournamentState.ts` (+ `src/server/*-bus.ts`).

## Phase 3 — Public pages (recreate, route‑by‑route)
Map each prototype screen onto existing routes/components; restyle, don't re‑architect.

- [ ] **3.1 Overview** → `src/app/page.tsx` + `src/components/home/*` (or `public-arena`).
  Hero + KPIs + 赛程轨迹 + 积分 bars + Orrery + 选手榜.
- [ ] **3.2 Matches** → `src/app/tournament/*` + `src/components/tournament/*`. Tabs
  赛程/积分榜/对阵图; rows open the **MatchDetail drawer** (3.6); team names → team page.
- [ ] **3.3 Players** → `src/app/...players` + `src/components/players/*`. Catalogue with
  search + sort(KDA/胜率/输出/场次/身价) + 位置 filter (reuse `src/lib/filters.ts`),
  detail file with radar/champ/season‑trend/log.
- [ ] **3.4 Draft** → `src/app/live` + `src/app/captain` + `src/components/draft|live|captain`.
  Status strip, team roster cards, pool, event stream — bound to the live hooks.
- [ ] **3.5 Signup** → `src/app/register` + `src/components/registration/*`. Form + live
  preview card.
- [ ] **3.6 MatchDetail drawer** — shared overlay component used by 3.1/3.2/3.7. Port
  `prototype/matchdetail.jsx` (compare bars, lineups + ChampAvatar + MVP, event timeline).
- **Accept:** every public route matches the prototype in both themes; drawer + hover
  cards work; numbers come from real data.

## Phase 4 — New pages
- [ ] **4.1 战队主页 / TeamPage** → new route `src/app/tournament/team/[teamId]/page.tsx`
  + `src/components/tournament/TeamPage.tsx`. Dossier hero, roster, 战力雷达 vs 均值,
  英雄池热力, 赛程战绩. Link from every team name/hover card. *(`prototype/pubextra.jsx`.)*
- [ ] **4.2 数据中心 / DataCenter** → new route `src/app/tournament/data/page.tsx` +
  `src/components/tournament/DataCenter.tsx` + nav entry. 英雄登场率, 位置 Meta,
  MVP 看板, 战力排行(→ team page).

## Phase 5 — Admin (operator back‑office)
Map onto `src/app/admin/*` + `src/components/admin/*` + `src/lib/admin`.
- [ ] **5.1 控制概览** (KPIs + funnel + op feed) · **5.2 报名审核** (tabs/search/approve‑exclude,
  wire to registration mutations) · **5.3 队伍管理** (expandable rosters) ·
  **5.4 赛事控制** (status‑machine + draft controls → real mutations/buses) ·
  **5.5 审计日志** (from the real audit table). Gate by role via existing
  `src/lib/api-guards.ts` / `auth-landing.ts`.

## Phase 6 — Public polish (reference implementations exist in prototype — port them)
- [ ] **6.1 Matches bracket** — clickable knockout **tree** opening MatchDetail + schedule
  filters + next‑match **Countdown**. *(Prototype: `KoTree` in `pubextra.jsx`, filters in
  `screens.jsx::MatchesScreen`.)*
- [ ] **6.2 Overview** — 今日赛程 timeline, MVP board, top‑teams **CompareRadar**, clickable
  Orrery nodes → team page. *(Prototype: `TodayTimeline`/`MvpStrip`/`TopTeamsCompare` in
  `pubextra.jsx`, Orrery `onBody` in `sig.jsx`.)*
- [ ] **6.3 Signup** — live field validation, avatar/战队 logo upload, post‑submit success
  **share card**. *(Prototype: `SignupScreen` + `AvatarSlot` in `screens2.jsx`.)*

## Phase 7 — QA
- [ ] Both themes on every route (visual pass). 
- [ ] `prefers-reduced-motion` disables decorative motion.
- [ ] Keyboard: drawer ESC, hover‑card focus equivalents, tab order.
- [ ] Responsive: dense 2‑col screens collapse < 1180px (see `.scr-2col/.app-body` rules).
- [ ] Numbers use `tabular-nums`; no `scrollIntoView`.
- [ ] Lint/adherence: respect `_adherence.oxlintrc.json`.

---

### Suggested order for a single Claude Code session
`Phase 0 → 1 → 2 → 3.6 (drawer) → 3.1–3.5 → 4 → 5 → 6 → 7`.
Land Phase 0–1 as the first PR (foundation), then one PR per screen group.

### Component → repo cheat‑sheet
| prototype | repo home |
|---|---|
| theme.js / console.css / nexus.css | `globals.css` + `components/nexus/*` + `ThemeStyleProvider` |
| sig.jsx / lolcharts.jsx / pubextra viz | `components/nexus/charts/*` |
| cards.jsx | `components/nexus/HoverCard*` |
| matchdetail.jsx | `components/tournament/MatchDetail.tsx` |
| screens.jsx (Overview) | `app/page.tsx` + `components/home/*` |
| screens.jsx (Matches) | `app/tournament/*` + `components/tournament/*` |
| screens2.jsx (Players) | `components/players/*` |
| screens2.jsx (Draft) | `components/draft|live|captain/*` + live hooks |
| screens2.jsx (Signup) | `app/register` + `components/registration/*` |
| pubextra.jsx (TeamPage/DataCenter) | `app/tournament/team/[teamId]` · `app/tournament/data` |
| admin.jsx | `app/admin/*` + `components/admin/*` + `lib/admin` |
| data.js | **discard** — use Prisma + `lib/*` + live hooks |
