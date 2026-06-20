# Handoff: NEXUS — LoL 内战赛事系统 UI

## Overview
**NEXUS** is a full UI redesign for a League‑of‑Legends in‑house tournament platform
(报名 → 选秀 → 赛事 → 数据). It is an esports **HUD / control‑deck** aesthetic with
two switchable visual directions and a public side + an operator back‑office.

- **COMMAND**(默认)— 科技电竞控制台:深蓝底、青色(#36D4E6)+ 橙色(#FF8A38)能量高亮、角切面板、六边形字形、战术网格、扫描线、霓虹辉光。
- **CELESTIAL** — 观测台/历法:暖棕底、橙色(#E8742A)、圆形字形、星图 Orrery、衬线斜体标题。

A single top‑bar **theme switch** retints the entire app (including the particle
starfield) live; a **mode switch**(公开端 / 管理后台)swaps the whole shell.

## About the Design Files
The files in `prototype/` are **design references written in HTML/CSS/React‑in‑Babel** —
they show the intended look, layout, data‑viz and interactions. **They are not production
code to copy verbatim.** The task is to **recreate these designs inside the existing
`lol-system` codebase** (Next.js App Router + shadcn/ui + Tailwind + Prisma) using its
established patterns, components and data layer. See `IMPLEMENTATION_PLAN.md` for the
concrete, Claude‑Code‑executable plan mapped to the real repo.

Open `prototype/index.html` in a browser to explore. State is persisted in
`localStorage` (`nexus.style`, `nexus.mode`, `nexus.route.*`).

## Fidelity
**High‑fidelity.** Final colors, typography, spacing, motion and interactions are all
specified. Recreate pixel‑accurately using the codebase's libraries. The only
placeholder is **champion art**: the prototype draws monogram tiles (`ChampAvatar`);
production should swap in real portraits from `src/data/champions.json` / Data Dragon.

---

## Design Tokens

All color is expressed as `R G B` channel triplets consumed via `rgb(var(--x) / <alpha>)`.
Two themes are applied by setting these on `:root` + a `data-style` attribute on `<html>`.

### COMMAND (default)
| token | value | hex | use |
|---|---|---|---|
| `--bg` | 8 13 20 | #080D14 | app background |
| `--surface` | 11 17 26 | #0B111A | bars, drawers |
| `--panel` | 13 21 32 | #0D1520 | panels |
| `--panel-2` | 17 28 42 | #111C2A | tiles, insets |
| `--line` | 29 53 72 | #1D3548 | borders/grid |
| `--ink` | 216 230 238 | #D8E6EE | primary text |
| `--dim` | 138 160 176 | #8AA0B0 | secondary text |
| `--faint` | 90 112 128 | #5A7080 | tertiary/kicker |
| `--accent` | 54 212 230 | #36D4E6 | primary cyan |
| `--accent-2` | 92 232 200 | #5CE8C8 | teal |
| `--good` | 108 222 150 | #6CDE96 | win/positive |
| `--bad` | 255 110 120 | #FF6E78 | loss/danger |
| `--gold` | 255 196 96 | #FFC460 | MVP/star |
| `--hot` | 255 138 56 | #FF8A38 | live/active accent |
| `--radius` | 2px | | corner radius |
| `--glow` | 0.9 | | glow multiplier |

### CELESTIAL
| token | value | hex |
|---|---|---|
| `--bg` | 18 14 10 | #120E0A |
| `--surface` | 24 19 13 | #18130D |
| `--panel` | 28 22 16 | #1C1610 |
| `--panel-2` | 38 30 22 | #261E16 |
| `--line` | 58 47 35 | #3A2F23 |
| `--ink` | 239 230 216 | #EFE6D8 |
| `--dim` | 184 168 146 | #B8A892 |
| `--faint` | 122 110 92 | #7A6E5C |
| `--accent` | 232 116 42 | #E8742A |
| `--accent-2` | 255 158 74 | #FF9E4A |
| `--good` | 120 196 120 | #78C478 |
| `--bad` | 224 96 72 | #E06048 |
| `--gold` | 230 178 90 | #E6B25A |
| `--hot` | 232 132 42 | #E8842A |
| `--radius` | 4px | |

### Typography
- **COMMAND** — display `"Saira Condensed"`, body `"Saira"`, mono `"JetBrains Mono"`, serif = Saira Condensed (no italics).
- **CELESTIAL** — display `"Saira Condensed"`, serif `"Newsreader"` (italic titles), body `"Saira"`, mono `"Space Mono"`.
- CJK fallbacks: `"Noto Sans SC"`, `"Noto Serif SC"`.
- `.kicker` — mono, 10px, `letter-spacing:.24em`, uppercase, `--faint`.
- `.title-xl` — display, 700, uppercase, `line-height:.92`.
- `.readout` — mono, `tabular-nums` — used for ALL numbers.

### Spacing / structure
- Panel padding 14–22px; screen padding 22px; grid gaps 12–18px.
- COMMAND panels: cut‑corner via `.frame` bracket pseudo‑elements + 2px radius; CELESTIAL: 4px radius, soft inset highlight.
- Buttons 36px (sm 28px), mono uppercase; COMMAND adds an 8px corner clip + hover light‑sweep.
- Live dots pulse; COMMAND tints them `--hot` (orange).

---

## Screens / Views

### Public (`mode = ops`)
1. **观测总览 / Overview** — hero (赛程阶段 serial + tournament), 4 KPI tiles, 赛程轨迹 line, A/B 积分 bars, **赛事星图 Orrery**(8 队轨道), 选手榜 TOP6.
2. **赛事中心 / Matches** — tabs 赛程 / 积分榜 / 对阵图. Schedule rows are **clickable → 单场详情抽屉**. Standings team names → **战队主页**. Bracket = 晋级星图.
3. **选手目录 / Players** — left catalogue (search + sort: KDA/胜率/输出/场次/身价 + 位置 filter) → right **观测档案**: win donut, 4 tiles, 能力雷达(5 轴), 常用英雄 bars, **赛季趋势线**, 对局记录表. Team name → 战队主页.
4. **选秀控制台 / Draft** — live status strip(on‑the‑clock 橙色), 8 队 roster cards(预算条 + 位置 pips), 选手池(点选预览/确认), 实时事件流.
5. **报名注册 / Signup** — form(召唤师/段位/主副位置/宣言/队长申请)+ live 选手卡预览 + 报名概况.
6. **战队主页 / TeamPage**(reached from team names/cards)— dossier hero + win donut, 首发阵容(KDA+趋势), **战力雷达 vs 联盟均值**, 战队英雄池热力, 赛程战绩(clickable).
7. **数据中心 / DataCenter** — 4 KPIs, 英雄登场率 TOP10 热力, 位置 Meta 甜甜圈, MVP 看板, **战力排行表**(click → 战队主页).

### Single‑match detail (drawer overlay, all screens)
Slide‑over from right: scoreline, **团队数据对比条**(击杀/经济/推塔/小龙/男爵), 双方首发阵容 + 英雄头像 + MVP, 关键事件时间线. Box score is **deterministically synthesized from `match.id`**. ESC / backdrop closes.

### Hover cards (global)
On player/team names anywhere: **player mini‑file**(6 轴六边形能力图 + 胜率环 + KDA/输出 + 近期战绩 + 常用英雄) / **team mini‑file**(战绩/积分/预算 + 首发 pips). Debounced `onMouseOver`, portaled to `<body>`.

### Admin (`mode = admin`)
1. **控制概览** — KPIs + sparklines, 报名漏斗, 实时操作流.
2. **报名审核** — tabs(待审/已通过/已排除/队长意向/全部 + counts), 搜索, per‑row 通过/排除/撤回(live state).
3. **队伍管理** — KPIs + expandable team cards(预算条 + 槽位 指派/调整).
4. **赛事控制** — 状态机(REGISTRATION→…→FINISHED 推进/回退)+ 选秀控制(轮次/模式/暂停/撤销/跳过/危险区)+ 操作日志.
5. **审计日志** — action‑type filtered immutable ledger.

---

## Interactions & Behavior
- **Theme switch**: sets CSS vars + `data-style`, re‑tints starfield (`window.NEXUS_STARS.refreshColors()`). Persist `nexus.style`.
- **Mode switch**: swaps nav + screens; per‑mode last route remembered (`nexus.route.<mode>`).
- **Match drawer**: `mdIn` slide .26s `cubic-bezier(.22,.61,.36,1)`; ESC + backdrop close.
- **Hover cards**: 110ms open debounce, flip left/right + vertical clamp to viewport; `pointer-events:none`.
- **Players**: sort/filter/search recompute via `useMemo`; selecting a row swaps the right file.
- **Admin review/control**: all actions mutate local React state (counts, status chips, logs, status‑machine stage) — wire to real mutations in production.
- **Motion** gated behind `@media (prefers-reduced-motion: no-preference)`: panel breathe, bracket pulse, grid drift, button pulse, scan drift, nav sweep.

## State Management (prototype)
`mode`, `route` (per‑mode), `style` — App; `selTeam`, `appMatch` — App (team page + global drawer). Screen‑local: selected player, draft picked, registration status map, control stage/round/mode/paused/log, players sort/filter/search. **No server calls** — all from `prototype/data.js` (seeded, deterministic, mirrors the Prisma model: Registration/Team/Draft/Tournament/Match/Game + audit).

## Assets
- Fonts: Google Fonts (Saira, Saira Condensed, Newsreader, Space Mono, JetBrains Mono, Noto Sans/Serif SC).
- **No image assets.** Champion tiles are CSS monograms — replace with real portraits in production (`src/data/champions.json`).
- All charts are inline **SVG** (no chart lib): radar, hex radar, orrery, trajectory line, bracket map, donut, sparkline, segmented bars, season trend, compare radar, champ‑heat, meta donut.

## Files (`prototype/`)
| file | contents |
|---|---|
| `index.html` | entry: fonts, Tailwind CDN config, script load order |
| `theme.js` | the two themes (token triplets + fonts) + `apply()` |
| `console.css` | component layer: panels/buttons/chips/tiles/tables + per‑`data-style` structure + motion + orange accents |
| `nexus.css` | shell: starfield canvas, statbar, nav rail, match/pool/leaderboard rows |
| `starfield.js` | particle FX canvas (theme‑aware) |
| `data.js` | seeded mock data (Prisma‑shaped) |
| `sig.jsx` | signature SVG viz (Orrery, TrajectoryLine, Sparkline, SegBudget, MoonPhase…) |
| `lolcharts.jsx` | LoL viz (PlayerRadar, WinDonut, ChampBars, PosPip, BracketMap, GroupBars, FormDots, KdaBars) |
| `cards.jsx` | HoverCard + player/team mini‑files + HexRadar + ChampAvatar |
| `matchdetail.jsx` | deterministic box‑score synth + slide‑over drawer |
| `screens.jsx` | Overview + Matches |
| `screens2.jsx` | Players + Draft + Signup |
| `pubextra.jsx` | TeamPage + DataCenter + CompareRadar/ChampHeat/MetaDonut/SeasonTrend/Countdown |
| `admin.jsx` | 5 admin screens + ADMIN_NAV |
| `app.jsx` | shell: statbar, nav rail, theme/mode switch, router, global match drawer |

## Status note (for the implementer)
The prototype is **complete and interactive** for every screen above, **including** the
former Phase‑6 polish — all now built and usable as reference implementations:
(a) Matches → clickable knockout **bracket tree** (`KoTree`) + schedule filters +
next‑match **Countdown**; (b) Overview → 今日赛程 **TodayTimeline** + **MvpStrip** +
top‑teams **TopTeamsCompare** + clickable Orrery nodes → team page; (c) Signup → live
field validation, avatar/logo upload (`AvatarSlot`), and a post‑submit success **share
card**. Building blocks: `Countdown`, `CompareRadar`, `KoTree`, `TodayTimeline`,
`MvpStrip`, hover cards, `MatchDetail`, `ChampHeat` (all in `prototype/`).
