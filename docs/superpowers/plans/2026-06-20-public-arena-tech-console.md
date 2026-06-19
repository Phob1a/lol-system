# Public Arena Tech Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public `/tournament` page into a unified Tech Arena Console while preserving the existing tournament data, routes, and full schedule/standings/bracket/leaderboard access.

**Architecture:** Keep `useTournamentState()` as the only public page data source, add tested pure view-model helpers, then compose a new arena component shell around the existing tournament content components. Styling is scoped to the public arena root with local CSS variables so Atlas can become a separate skin without introducing a theme system in this phase.

**Tech Stack:** Next.js 15, React 18 client components, TypeScript 5, Tailwind CSS, shadcn/Radix Tabs, lucide-react icons, Vitest, React Testing Library, Playwright screenshot verification.

## Global Constraints

- First phase target page is only `/tournament`; do not redesign admin/captain/login/register pages or other public pages in this implementation.
- Put the other public pages (`/`, `/live`, player detail, match detail) in phase two after this `/tournament` phase is completed and verified.
- Do not change Prisma schema, tournament APIs, tournament state machine, schedule generation, score entry, or import logic.
- Preserve and reuse `ScheduleList`, `GroupStandings`, `BracketView`, and `LeaderboardView` for full below-fold content.
- Use existing `useTournamentState()` data: `state.matches`, `state.standings`, `state.bracket`, and `state.tournament`.
- Do not implement Atlas skin, runtime theme switching, user theme selection, or backend skin configuration in this phase.
- Keep the visual language unified as Tech Arena Console: dark stage, cyan primary signal, amber secondary signal, HUD top bar, dot grid, scanline, bracket corners, radar/signal visuals, iconized stats.
- Do not introduce heavyweight animation, 3D libraries, external fonts, or new data-fetching dependencies.
- Do not invent rankings, strength scores, viewer counts, or player statistics not present in the current read model.
- Mobile must be readable with no horizontal overflow, no overlapping text, and reduced decorative effects.
- No emoji in UI copy.

---

## File Structure

- Create `src/lib/tournament/arena-view-model.ts`
  - Pure helpers and types for next match, arena stats, headline copy, hot signals, and team names.
- Create `src/lib/tournament/arena-view-model.test.ts`
  - Unit tests for all pure helpers, including sparse-data and finished-event cases.
- Create `src/components/tournament/arena/TournamentArenaView.tsx`
  - Top-level public arena composition. Accepts `state` and `loaded` props so it is easy to test without mocking the hook.
- Create `src/components/tournament/arena/ArenaHud.tsx`
  - HUD status strip: product label, system signals, tournament phase, next match time.
- Create `src/components/tournament/arena/ArenaHero.tsx`
  - Hero title, subtitle, primary CTAs, and key stat cards.
- Create `src/components/tournament/arena/TeamSignalMap.tsx`
  - Decorative SVG signal/radar visualization based only on derived event counts and known teams.
- Create `src/components/tournament/arena/NextMatchPanel.tsx`
  - Next scheduled match card with safe empty state and match link.
- Create `src/components/tournament/arena/HotSignalsPanel.tsx`
  - Iconized cards from conservative derived signals.
- Create `src/components/tournament/arena/BracketPathPreview.tsx`
  - Compact bracket-path visual summary from existing bracket rounds.
- Create `src/components/tournament/arena/TeamTelemetryPanel.tsx`
  - Team/group telemetry summary from existing standings.
- Create `src/components/tournament/arena/ArenaSectionTabs.tsx`
  - Below-fold tabs that mount the existing `ScheduleList`, `GroupStandings`, `BracketView`, and `LeaderboardView`.
- Create `src/components/tournament/arena/TournamentArenaView.test.tsx`
  - Smoke tests for loading, empty, and populated states.
- Modify `src/components/tournament/PublicTournamentView.tsx`
  - Keep the hook here, delegate rendering to `TournamentArenaView`.
- Modify `src/app/globals.css`
  - Add scoped `.arena-console` CSS variables and low-level decorative utilities only under the public arena root.

---

### Task 1: Arena View-Model Helpers

**Files:**
- Create: `src/lib/tournament/arena-view-model.ts`
- Create: `src/lib/tournament/arena-view-model.test.ts`

**Interfaces:**
- Consumes: `PublicState` from `src/hooks/useTournamentState.ts`
- Produces:
  - `type PublicTournamentState = NonNullable<PublicState>`
  - `type ArenaMatch = PublicTournamentState['matches'][number]`
  - `type ArenaStats = { totalMatches: number; completedMatches: number; scheduledMatches: number; pendingMatches: number; liveMatches: number; progressPercent: number; teamCount: number; groupCount: number; bracketRoundCount: number }`
  - `type ArenaHeadline = { eyebrow: string; title: string; subtitle: string; primaryCtaLabel: string; primaryCtaHref: string; secondaryCtaLabel: string; secondaryCtaHref: string }`
  - `type ArenaHotSignal = { id: string; label: string; value: string; detail: string; tone: 'cyan' | 'amber' | 'emerald' | 'violet' }`
  - `getNextMatch(matches: ArenaMatch[], now?: Date): ArenaMatch | null`
  - `getArenaStats(state: PublicTournamentState): ArenaStats`
  - `getTournamentHeadline(state: PublicTournamentState, now?: Date): ArenaHeadline`
  - `getHotSignals(state: PublicTournamentState, now?: Date): ArenaHotSignal[]`
  - `formatArenaDateTime(iso: string | null): string`

- [ ] **Step 1: Write the failing view-model tests**

Create `src/lib/tournament/arena-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import {
  formatArenaDateTime,
  getArenaStats,
  getHotSignals,
  getNextMatch,
  getTournamentHeadline,
} from './arena-view-model';

type State = NonNullable<PublicState>;
type Match = State['matches'][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    label: '小组赛 R1',
    roundKey: 'GROUP',
    bestOf: 1,
    scheduledAt: '2026-07-01T12:00:00.000Z',
    status: 'SCHEDULED',
    isWalkover: false,
    teamA: { id: 'ta', name: '蓝队' },
    teamB: { id: 'tb', name: '红队' },
    winnerTeamId: null,
    groupId: 'g1',
    ...overrides,
  };
}

function state(overrides: Partial<State> = {}): State {
  return {
    tournament: { id: 't1', name: '夏季联赛', kind: 'GROUP_KNOCKOUT', status: 'ACTIVE' },
    matches: [match()],
    standings: [
      {
        groupId: 'g1',
        name: 'A组',
        teams: { ta: '蓝队', tb: '红队', tc: '金队' },
        rows: [
          { teamId: 'ta', played: 2, wins: 2, losses: 0, points: 6, rank: 1, tied: false },
          { teamId: 'tb', played: 2, wins: 1, losses: 1, points: 3, rank: 2, tied: false },
        ],
      },
    ],
    bracket: [
      { roundKey: 'SEMIFINAL', matches: [{ id: 'b1', label: '半决赛 1', teamAId: 'ta', teamBId: 'tb', winnerTeamId: null, status: 'SCHEDULED' }] },
    ],
    ...overrides,
  };
}

describe('arena view model', () => {
  it('selects the nearest future scheduled non-finished match', () => {
    const now = new Date('2026-07-01T10:00:00.000Z');
    const result = getNextMatch([
      match({ id: 'past', scheduledAt: '2026-07-01T09:00:00.000Z' }),
      match({ id: 'finished', scheduledAt: '2026-07-01T11:00:00.000Z', status: 'FINISHED' }),
      match({ id: 'next', scheduledAt: '2026-07-01T12:00:00.000Z' }),
      match({ id: 'later', scheduledAt: '2026-07-01T16:00:00.000Z' }),
    ], now);

    expect(result?.id).toBe('next');
  });

  it('returns null when there is no upcoming scheduled match', () => {
    expect(getNextMatch([
      match({ id: 'done', status: 'FINISHED' }),
      match({ id: 'draft', scheduledAt: null }),
    ], new Date('2026-07-01T10:00:00.000Z'))).toBeNull();
  });

  it('derives conservative arena stats without duplicate teams', () => {
    expect(getArenaStats(state({
      matches: [
        match({ id: 'm1', status: 'FINISHED', teamA: { id: 'ta', name: '蓝队' } }),
        match({ id: 'm2', status: 'SCHEDULED', teamA: { id: 'ta', name: '蓝队' }, teamB: { id: 'tc', name: '金队' } }),
        match({ id: 'm3', status: 'IN_PROGRESS', teamA: null, teamB: null }),
      ],
    }))).toEqual({
      totalMatches: 3,
      completedMatches: 1,
      scheduledMatches: 1,
      pendingMatches: 1,
      liveMatches: 1,
      progressPercent: 33,
      teamCount: 3,
      groupCount: 1,
      bracketRoundCount: 1,
    });
  });

  it('generates active headline copy with a next-match CTA', () => {
    const headline = getTournamentHeadline(state(), new Date('2026-07-01T10:00:00.000Z'));

    expect(headline.title).toBe('夏季联赛进入公共竞技场');
    expect(headline.primaryCtaLabel).toBe('观看下一场');
    expect(headline.primaryCtaHref).toBe('/tournament/match/m1');
  });

  it('generates finished headline copy when every match is complete', () => {
    const headline = getTournamentHeadline(state({
      matches: [match({ id: 'm1', status: 'FINISHED' })],
    }), new Date('2026-07-02T10:00:00.000Z'));

    expect(headline.title).toBe('夏季联赛赛果已归档');
    expect(headline.primaryCtaLabel).toBe('查看数据榜');
    expect(headline.primaryCtaHref).toBe('#leaderboard');
  });

  it('keeps hot signals grounded in existing event data', () => {
    const signals = getHotSignals(state(), new Date('2026-07-01T10:00:00.000Z'));

    expect(signals.map((signal) => signal.id)).toEqual([
      'next-match',
      'leader',
      'bracket',
      'schedule',
    ]);
    expect(signals[0].value).toBe('蓝队 vs 红队');
  });

  it('formats arena date-times and sparse values', () => {
    expect(formatArenaDateTime('2026-07-01T12:00:00.000Z')).toMatch(/07\/01|7\/1/);
    expect(formatArenaDateTime(null)).toBe('待同步');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/tournament/arena-view-model.test.ts`

Expected: FAIL with a module resolution error for `./arena-view-model`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/tournament/arena-view-model.ts`:

```ts
import type { PublicState } from '@/hooks/useTournamentState';

export type PublicTournamentState = NonNullable<PublicState>;
export type ArenaMatch = PublicTournamentState['matches'][number];

export type ArenaStats = {
  totalMatches: number;
  completedMatches: number;
  scheduledMatches: number;
  pendingMatches: number;
  liveMatches: number;
  progressPercent: number;
  teamCount: number;
  groupCount: number;
  bracketRoundCount: number;
};

export type ArenaHeadline = {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export type ArenaHotSignal = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'cyan' | 'amber' | 'emerald' | 'violet';
};

const FINISHED_STATUSES = new Set(['FINISHED', 'CANCELED', 'WALKOVER']);
const LIVE_STATUSES = new Set(['IN_PROGRESS', 'LIVE']);

function isFinished(match: ArenaMatch) {
  return FINISHED_STATUSES.has(match.status) || match.isWalkover;
}

function teamLabel(team: ArenaMatch['teamA']) {
  return team?.name ?? '待定席位';
}

export function formatArenaDateTime(iso: string | null): string {
  if (!iso) return '待同步';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function getNextMatch(matches: ArenaMatch[], now = new Date()): ArenaMatch | null {
  const nowTime = now.getTime();

  return matches
    .filter((match) => match.scheduledAt && !isFinished(match))
    .filter((match) => new Date(match.scheduledAt as string).getTime() >= nowTime)
    .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime())[0] ?? null;
}

export function getArenaStats(state: PublicTournamentState): ArenaStats {
  const teamIds = new Set<string>();

  for (const match of state.matches) {
    if (match.teamA?.id) teamIds.add(match.teamA.id);
    if (match.teamB?.id) teamIds.add(match.teamB.id);
  }

  for (const group of state.standings) {
    for (const teamId of Object.keys(group.teams)) teamIds.add(teamId);
  }

  const completedMatches = state.matches.filter(isFinished).length;
  const scheduledMatches = state.matches.filter((match) => match.status === 'SCHEDULED' && match.scheduledAt).length;
  const liveMatches = state.matches.filter((match) => LIVE_STATUSES.has(match.status)).length;
  const totalMatches = state.matches.length;

  return {
    totalMatches,
    completedMatches,
    scheduledMatches,
    pendingMatches: Math.max(totalMatches - completedMatches - scheduledMatches, 0),
    liveMatches,
    progressPercent: totalMatches === 0 ? 0 : Math.round((completedMatches / totalMatches) * 100),
    teamCount: teamIds.size,
    groupCount: state.standings.length,
    bracketRoundCount: state.bracket.length,
  };
}

export function getTournamentHeadline(state: PublicTournamentState, now = new Date()): ArenaHeadline {
  const stats = getArenaStats(state);
  const nextMatch = getNextMatch(state.matches, now);

  if (stats.totalMatches > 0 && stats.completedMatches === stats.totalMatches) {
    return {
      eyebrow: 'PUBLIC ARENA / ARCHIVE READY',
      title: `${state.tournament.name}赛果已归档`,
      subtitle: '完整赛程、淘汰路径和选手数据已经同步，可以从数据榜回看关键表现。',
      primaryCtaLabel: '查看数据榜',
      primaryCtaHref: '#leaderboard',
      secondaryCtaLabel: '回看赛程',
      secondaryCtaHref: '#schedule',
    };
  }

  if (nextMatch) {
    return {
      eyebrow: 'PUBLIC ARENA / MATCH SIGNAL LOCKED',
      title: `${state.tournament.name}进入公共竞技场`,
      subtitle: `${teamLabel(nextMatch.teamA)} 与 ${teamLabel(nextMatch.teamB)} 已锁定下一场信号，赛程和数据面板保持实时同步。`,
      primaryCtaLabel: '观看下一场',
      primaryCtaHref: `/tournament/match/${nextMatch.id}`,
      secondaryCtaLabel: '查看对阵图',
      secondaryCtaHref: '#bracket',
    };
  }

  return {
    eyebrow: 'PUBLIC ARENA / SYSTEM STANDBY',
    title: `${state.tournament.name}等待赛程同步`,
    subtitle: '赛事框架已经就绪，公开端会在排期完成后显示下一场、对阵路径和观赛入口。',
    primaryCtaLabel: '查看赛程',
    primaryCtaHref: '#schedule',
    secondaryCtaLabel: '查看小组赛',
    secondaryCtaHref: '#standings',
  };
}

export function getHotSignals(state: PublicTournamentState, now = new Date()): ArenaHotSignal[] {
  const stats = getArenaStats(state);
  const nextMatch = getNextMatch(state.matches, now);
  const leaderGroup = state.standings.find((group) => group.rows.length > 0);
  const leaderRow = leaderGroup?.rows.slice().sort((a, b) => a.rank - b.rank)[0];
  const leaderName = leaderRow && leaderGroup ? leaderGroup.teams[leaderRow.teamId] : null;

  return [
    {
      id: 'next-match',
      label: 'NEXT SIGNAL',
      value: nextMatch ? `${teamLabel(nextMatch.teamA)} vs ${teamLabel(nextMatch.teamB)}` : '待排期',
      detail: nextMatch ? `${nextMatch.label ?? nextMatch.roundKey ?? '赛事'} · ${formatArenaDateTime(nextMatch.scheduledAt)}` : '暂无可公开的下一场比赛',
      tone: 'cyan',
    },
    {
      id: 'leader',
      label: 'GROUP LEAD',
      value: leaderName ?? '待产生',
      detail: leaderRow ? `${leaderGroup?.name ?? '小组'} · ${leaderRow.wins}胜 / ${leaderRow.points}分` : '小组积分尚未形成',
      tone: 'amber',
    },
    {
      id: 'bracket',
      label: 'BRACKET SYNC',
      value: `${stats.bracketRoundCount} 轮`,
      detail: stats.bracketRoundCount > 0 ? '淘汰赛路径已接入公开视图' : '淘汰赛路径等待生成',
      tone: 'violet',
    },
    {
      id: 'schedule',
      label: 'MATCH FLOW',
      value: `${stats.progressPercent}%`,
      detail: `${stats.completedMatches}/${stats.totalMatches} 场已完成`,
      tone: 'emerald',
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/tournament/arena-view-model.test.ts`

Expected: PASS for all `arena view model` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/arena-view-model.ts src/lib/tournament/arena-view-model.test.ts
git commit -m "feat: add public arena view model"
```

---

### Task 2: Arena Components and Scoped Visual Style

**Files:**
- Create: `src/components/tournament/arena/ArenaHud.tsx`
- Create: `src/components/tournament/arena/ArenaHero.tsx`
- Create: `src/components/tournament/arena/TeamSignalMap.tsx`
- Create: `src/components/tournament/arena/NextMatchPanel.tsx`
- Create: `src/components/tournament/arena/HotSignalsPanel.tsx`
- Create: `src/components/tournament/arena/BracketPathPreview.tsx`
- Create: `src/components/tournament/arena/TeamTelemetryPanel.tsx`
- Create: `src/components/tournament/arena/ArenaSectionTabs.tsx`
- Create: `src/components/tournament/arena/TournamentArenaView.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes from Task 1:
  - `ArenaMatch`
  - `ArenaStats`
  - `ArenaHeadline`
  - `ArenaHotSignal`
  - `PublicTournamentState`
  - `formatArenaDateTime`
  - `getArenaStats`
  - `getHotSignals`
  - `getNextMatch`
  - `getTournamentHeadline`
- Produces:
  - `TournamentArenaView({ state, loaded }: { state: PublicState; loaded: boolean }): JSX.Element`

- [ ] **Step 1: Add scoped arena CSS**

Append to `src/app/globals.css`:

```css
@layer components {
  .arena-console {
    --arena-bg: #07111f;
    --arena-panel: rgba(9, 23, 43, 0.78);
    --arena-panel-strong: rgba(12, 32, 58, 0.92);
    --arena-line: rgba(96, 211, 255, 0.3);
    --arena-cyan: #5ee7ff;
    --arena-amber: #f6c35f;
    --arena-emerald: #66f0b0;
    --arena-violet: #9b8cff;
    --arena-text: #e6f6ff;
    --arena-muted: #8da6bd;
    background:
      radial-gradient(circle at 16% 0%, rgba(94, 231, 255, 0.22), transparent 30rem),
      radial-gradient(circle at 88% 12%, rgba(246, 195, 95, 0.12), transparent 26rem),
      linear-gradient(180deg, #06101d 0%, var(--arena-bg) 58%, #050b13 100%);
    color: var(--arena-text);
    min-height: calc(100vh - 4rem);
    overflow-x: clip;
  }

  .arena-console::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(94, 231, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(94, 231, 255, 0.06) 1px, transparent 1px);
    background-size: 36px 36px;
    mask-image: linear-gradient(to bottom, black 0%, transparent 78%);
  }

  .arena-panel {
    border: 1px solid var(--arena-line);
    background:
      linear-gradient(135deg, rgba(94, 231, 255, 0.08), transparent 34%),
      var(--arena-panel);
    box-shadow: 0 0 0 1px rgba(94, 231, 255, 0.05), 0 24px 80px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(18px);
  }

  .arena-corner {
    clip-path: polygon(0 14px, 14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
  }

  .arena-scanline {
    position: relative;
  }

  .arena-scanline::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.035),
      rgba(255, 255, 255, 0.035) 1px,
      transparent 1px,
      transparent 7px
    );
    opacity: 0.26;
  }
}

@media (max-width: 767px) {
  .arena-console {
    min-height: calc(100vh - 3.5rem);
  }

  .arena-console::before,
  .arena-scanline::after {
    opacity: 0.4;
  }
}
```

- [ ] **Step 2: Add the HUD component**

Create `src/components/tournament/arena/ArenaHud.tsx`:

```tsx
import { Activity, Database, RadioTower, ShieldCheck } from 'lucide-react';
import type { ArenaMatch, ArenaStats, PublicTournamentState } from '@/lib/tournament/arena-view-model';
import { formatArenaDateTime } from '@/lib/tournament/arena-view-model';

type ArenaHudProps = {
  tournament: PublicTournamentState['tournament'];
  stats: ArenaStats;
  nextMatch: ArenaMatch | null;
};

export function ArenaHud({ tournament, stats, nextMatch }: ArenaHudProps) {
  const signals = [
    { icon: RadioTower, label: stats.liveMatches > 0 ? 'LIVE SIGNAL' : 'SCHEDULE READY' },
    { icon: Database, label: 'DATA READY' },
    { icon: ShieldCheck, label: 'VIEWER MODE' },
  ];

  return (
    <header className="relative z-10 flex flex-col gap-3 border-b border-cyan-300/15 px-4 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">LOL-SYSTEM / PUBLIC ARENA</p>
        <h1 className="truncate text-lg font-semibold text-white md:text-xl">{tournament.name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200/80">
        {signals.map((signal) => {
          const Icon = signal.icon;
          return (
            <span key={signal.label} className="inline-flex h-8 items-center gap-2 rounded border border-cyan-200/20 bg-cyan-200/5 px-3">
              <Icon className="h-3.5 w-3.5 text-cyan-200" />
              {signal.label}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-2 rounded border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-amber-100">
          <Activity className="h-3.5 w-3.5" />
          {tournament.status}
        </span>
        <span className="rounded border border-cyan-200/20 bg-slate-950/30 px-3 py-2">
          NEXT {formatArenaDateTime(nextMatch?.scheduledAt ?? null)}
        </span>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Add the hero and visual panels**

Create the remaining component files with these exports and prop contracts:

```tsx
// src/components/tournament/arena/ArenaHero.tsx
import Link from 'next/link';
import { ArrowRight, BarChart3, GitBranch, Trophy } from 'lucide-react';
import type { ArenaHeadline, ArenaStats } from '@/lib/tournament/arena-view-model';

type ArenaHeroProps = {
  headline: ArenaHeadline;
  stats: ArenaStats;
};

export function ArenaHero({ headline, stats }: ArenaHeroProps) {
  const cards = [
    { label: 'MATCH PROGRESS', value: `${stats.progressPercent}%`, detail: `${stats.completedMatches}/${stats.totalMatches} 已完成`, icon: Trophy },
    { label: 'TEAMS ONLINE', value: String(stats.teamCount), detail: `${stats.groupCount} 个分组`, icon: BarChart3 },
    { label: 'BRACKET PATH', value: String(stats.bracketRoundCount), detail: '淘汰赛轮次', icon: GitBranch },
  ];

  return (
    <section className="arena-panel arena-corner arena-scanline relative z-10 overflow-hidden p-5 md:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">{headline.eyebrow}</p>
          <h2 className="mt-4 max-w-4xl text-4xl font-black leading-none text-white md:text-6xl">{headline.title}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">{headline.subtitle}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex items-center justify-center gap-2 rounded border border-cyan-200/45 bg-cyan-200 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(94,231,255,0.35)]" href={headline.primaryCtaHref}>
              {headline.primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="inline-flex items-center justify-center rounded border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white" href={headline.secondaryCtaHref}>
              {headline.secondaryCtaLabel}
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded border border-white/10 bg-slate-950/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
                  <Icon className="h-4 w-4 text-amber-200" />
                </div>
                <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                <p className="mt-1 text-xs text-slate-400">{card.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

Use the same prop-first pattern for these component files:

```tsx
// src/components/tournament/arena/TeamSignalMap.tsx
import type { ArenaStats, PublicTournamentState } from '@/lib/tournament/arena-view-model';

type TeamSignalMapProps = {
  state: PublicTournamentState;
  stats: ArenaStats;
};

export function TeamSignalMap({ state, stats }: TeamSignalMapProps) {
  const teamNames = Array.from(new Set(state.matches.flatMap((match) => [match.teamA?.name, match.teamB?.name]).filter(Boolean))).slice(0, 6);
  const points = ['160,32', '266,92', '266,212', '160,272', '54,212', '54,92'];

  return (
    <section className="arena-panel arena-corner relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">TEAM SIGNAL MAP</p>
          <h3 className="mt-2 text-xl font-bold text-white">赛事信号图</h3>
        </div>
        <span className="rounded border border-cyan-200/20 px-2 py-1 text-xs text-cyan-100">{stats.teamCount} TEAMS</span>
      </div>
      <svg viewBox="0 0 320 300" className="mt-4 h-56 w-full text-cyan-200" role="img" aria-label="赛事信号图">
        <polygon points={points.join(' ')} fill="rgba(94, 231, 255, 0.08)" stroke="rgba(94, 231, 255, 0.4)" />
        <polygon points="160,70 230,110 218,198 160,236 102,198 90,110" fill="rgba(246, 195, 95, 0.12)" stroke="rgba(246, 195, 95, 0.55)" />
        <line x1="160" y1="32" x2="160" y2="272" stroke="rgba(255,255,255,0.12)" />
        <line x1="54" y1="92" x2="266" y2="212" stroke="rgba(255,255,255,0.12)" />
        <line x1="266" y1="92" x2="54" y2="212" stroke="rgba(255,255,255,0.12)" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(',');
          return <circle key={point} cx={cx} cy={cy} r={4 + index} fill="currentColor" opacity={0.9 - index * 0.08} />;
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2">
        {(teamNames.length > 0 ? teamNames : ['等待队伍同步']).map((name) => (
          <span key={name} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">{name}</span>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// src/components/tournament/arena/NextMatchPanel.tsx
import Link from 'next/link';
import { CalendarClock, Swords } from 'lucide-react';
import type { ArenaMatch } from '@/lib/tournament/arena-view-model';
import { formatArenaDateTime } from '@/lib/tournament/arena-view-model';

type NextMatchPanelProps = {
  match: ArenaMatch | null;
};

export function NextMatchPanel({ match }: NextMatchPanelProps) {
  if (!match) {
    return (
      <section className="arena-panel arena-corner p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">NEXT MATCH</p>
        <h3 className="mt-3 text-2xl font-bold text-white">等待下一场同步</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">当前没有可公开的已排期比赛，赛程生成后这里会出现观赛入口。</p>
        <a href="#schedule" className="mt-5 inline-flex rounded border border-cyan-200/30 px-4 py-2 text-sm font-semibold text-cyan-100">查看赛程</a>
      </section>
    );
  }

  return (
    <section className="arena-panel arena-corner p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">NEXT MATCH</p>
        <span className="inline-flex items-center gap-1 text-xs text-amber-100"><CalendarClock className="h-3.5 w-3.5" />{formatArenaDateTime(match.scheduledAt)}</span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <p className="min-w-0 truncate text-lg font-bold text-white">{match.teamA?.name ?? '待定席位'}</p>
        <Swords className="h-5 w-5 text-cyan-200" />
        <p className="min-w-0 truncate text-right text-lg font-bold text-white">{match.teamB?.name ?? '待定席位'}</p>
      </div>
      <p className="mt-3 text-sm text-slate-400">{match.label ?? match.roundKey ?? '赛事对局'} · BO{match.bestOf}</p>
      <Link href={`/tournament/match/${match.id}`} className="mt-5 inline-flex w-full items-center justify-center rounded border border-cyan-200/45 bg-cyan-200/15 px-4 py-3 text-sm font-semibold text-cyan-50">
        进入比赛详情
      </Link>
    </section>
  );
}
```

```tsx
// src/components/tournament/arena/HotSignalsPanel.tsx
import { Activity, GitBranch, RadioTower, Trophy } from 'lucide-react';
import type { ArenaHotSignal } from '@/lib/tournament/arena-view-model';

type HotSignalsPanelProps = {
  signals: ArenaHotSignal[];
};

const icons = {
  'next-match': RadioTower,
  leader: Trophy,
  bracket: GitBranch,
  schedule: Activity,
};

export function HotSignalsPanel({ signals }: HotSignalsPanelProps) {
  return (
    <section className="arena-panel arena-corner p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">HOT SIGNALS</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {signals.map((signal) => {
          const Icon = icons[signal.id as keyof typeof icons] ?? Activity;
          return (
            <article key={signal.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{signal.label}</p>
                <Icon className="h-4 w-4 text-cyan-200" />
              </div>
              <p className="mt-3 truncate text-lg font-bold text-white">{signal.value}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{signal.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

```tsx
// src/components/tournament/arena/BracketPathPreview.tsx
import { GitCommitHorizontal } from 'lucide-react';
import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type BracketPathPreviewProps = {
  bracket: PublicTournamentState['bracket'];
};

export function BracketPathPreview({ bracket }: BracketPathPreviewProps) {
  return (
    <section className="arena-panel arena-corner p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">BRACKET PATH</p>
          <h3 className="mt-2 text-xl font-bold text-white">淘汰路径</h3>
        </div>
        <GitCommitHorizontal className="h-5 w-5 text-amber-200" />
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden">
        {(bracket.length > 0 ? bracket : [{ roundKey: 'WAITING', matches: [] }]).map((round, index) => (
          <a key={round.roundKey} href="#bracket" className="min-w-0 flex-1 rounded border border-cyan-200/15 bg-slate-950/30 p-3">
            <p className="truncate text-xs font-semibold text-cyan-100">{round.roundKey}</p>
            <p className="mt-3 text-2xl font-black text-white">{round.matches.length}</p>
            <p className="text-xs text-slate-400">ROUND {index + 1}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// src/components/tournament/arena/TeamTelemetryPanel.tsx
import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type TeamTelemetryPanelProps = {
  standings: PublicTournamentState['standings'];
};

export function TeamTelemetryPanel({ standings }: TeamTelemetryPanelProps) {
  const rows = standings.flatMap((group) =>
    group.rows.slice(0, 3).map((row) => ({
      id: `${group.groupId}-${row.teamId}`,
      group: group.name,
      name: group.teams[row.teamId] ?? '未知队伍',
      wins: row.wins,
      points: row.points,
      rank: row.rank,
    })),
  ).slice(0, 6);

  return (
    <section className="arena-panel arena-corner p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">TEAM TELEMETRY</p>
      <div className="mt-4 space-y-3">
        {(rows.length > 0 ? rows : [{ id: 'empty', group: '等待同步', name: '暂无积分数据', wins: 0, points: 0, rank: 0 }]).map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{row.name}</p>
              <p className="text-xs text-slate-400">{row.group} · Rank {row.rank || '-'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-amber-100">{row.points}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{row.wins}W</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// src/components/tournament/arena/ArenaSectionTabs.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BracketView } from '@/components/tournament/BracketView';
import { GroupStandings } from '@/components/tournament/GroupStandings';
import { LeaderboardView } from '@/components/tournament/LeaderboardView';
import { ScheduleList } from '@/components/tournament/ScheduleList';
import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type ArenaSectionTabsProps = {
  state: PublicTournamentState;
};

export function ArenaSectionTabs({ state }: ArenaSectionTabsProps) {
  return (
    <section className="relative z-10" id="arena-sections">
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 border border-cyan-200/15 bg-slate-950/50 p-1 sm:grid-cols-4">
          <TabsTrigger id="schedule" value="schedule">赛程</TabsTrigger>
          <TabsTrigger id="standings" value="standings">小组赛</TabsTrigger>
          <TabsTrigger id="bracket" value="bracket">对阵图</TabsTrigger>
          <TabsTrigger id="leaderboard" value="leaderboard">数据榜</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><ScheduleList matches={state.matches} /></TabsContent>
        <TabsContent value="standings"><GroupStandings standings={state.standings} /></TabsContent>
        <TabsContent value="bracket"><BracketView bracket={state.bracket} standings={state.standings} matches={state.matches} /></TabsContent>
        <TabsContent value="leaderboard"><LeaderboardView /></TabsContent>
      </Tabs>
    </section>
  );
}
```

- [ ] **Step 4: Add the top-level arena composition**

Create `src/components/tournament/arena/TournamentArenaView.tsx`:

```tsx
'use client';

import type { PublicState } from '@/hooks/useTournamentState';
import {
  getArenaStats,
  getHotSignals,
  getNextMatch,
  getTournamentHeadline,
} from '@/lib/tournament/arena-view-model';
import { ArenaHero } from './ArenaHero';
import { ArenaHud } from './ArenaHud';
import { ArenaSectionTabs } from './ArenaSectionTabs';
import { BracketPathPreview } from './BracketPathPreview';
import { HotSignalsPanel } from './HotSignalsPanel';
import { NextMatchPanel } from './NextMatchPanel';
import { TeamSignalMap } from './TeamSignalMap';
import { TeamTelemetryPanel } from './TeamTelemetryPanel';

type TournamentArenaViewProps = {
  state: PublicState;
  loaded: boolean;
};

export function TournamentArenaView({ state, loaded }: TournamentArenaViewProps) {
  if (!loaded) {
    return (
      <div className="arena-console relative -mx-4 -my-6 flex items-center justify-center px-4 py-24 md:-mx-8">
        <div className="arena-panel arena-corner w-full max-w-md p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">PUBLIC ARENA</p>
          <p className="mt-3 text-sm text-slate-300">赛事信号加载中...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="arena-console relative -mx-4 -my-6 flex items-center justify-center px-4 py-24 md:-mx-8">
        <div className="arena-panel arena-corner w-full max-w-lg p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">SYSTEM STANDBY</p>
          <h2 className="mt-4 text-2xl font-black text-white">暂未创建赛事</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">公开竞技场会在赛事创建后显示赛程、对阵图和数据榜入口。</p>
          <a href="/" className="mt-6 inline-flex rounded border border-cyan-200/35 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-50">返回首页</a>
        </div>
      </div>
    );
  }

  const stats = getArenaStats(state);
  const nextMatch = getNextMatch(state.matches);
  const headline = getTournamentHeadline(state);
  const signals = getHotSignals(state);

  return (
    <div className="arena-console relative -mx-4 -my-6 md:-mx-8">
      <ArenaHud tournament={state.tournament} stats={stats} nextMatch={nextMatch} />
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
        <ArenaHero headline={headline} stats={stats} />
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <TeamSignalMap state={state} stats={stats} />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
            <NextMatchPanel match={nextMatch} />
            <HotSignalsPanel signals={signals} />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <BracketPathPreview bracket={state.bracket} />
          <TeamTelemetryPanel standings={state.standings} />
        </div>
        <ArenaSectionTabs state={state} />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck for component contracts**

Run: `npm run typecheck`

Expected: PASS. If it fails because a prop type is too broad or a component import path is wrong, fix the named file and rerun the same command until it passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/tournament/arena
git commit -m "feat: add public arena console components"
```

---

### Task 3: Replace Public Tournament Rendering

**Files:**
- Modify: `src/components/tournament/PublicTournamentView.tsx`

**Interfaces:**
- Consumes: `TournamentArenaView({ state, loaded })` from Task 2
- Produces: The `/tournament` page renders the new arena shell while keeping `useTournamentState()` as the fetch/SSE owner.

- [ ] **Step 1: Replace the old tab container with the arena view**

Change `src/components/tournament/PublicTournamentView.tsx` to:

```tsx
'use client';

import { TournamentArenaView } from '@/components/tournament/arena/TournamentArenaView';
import { useTournamentState } from '@/hooks/useTournamentState';

export function PublicTournamentView() {
  const { state, loaded } = useTournamentState();

  return <TournamentArenaView state={state} loaded={loaded} />;
}
```

- [ ] **Step 2: Run focused typecheck**

Run: `npm run typecheck`

Expected: PASS with no errors from `PublicTournamentView.tsx` or arena components.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/PublicTournamentView.tsx
git commit -m "feat: route public tournament through arena console"
```

---

### Task 4: Component Smoke Tests

**Files:**
- Create: `src/components/tournament/arena/TournamentArenaView.test.tsx`

**Interfaces:**
- Consumes: `TournamentArenaView` from Task 2
- Produces: RTL coverage for loading, empty, and populated states without mocking the network hook.

- [ ] **Step 1: Write component tests**

Create `src/components/tournament/arena/TournamentArenaView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import { TournamentArenaView } from './TournamentArenaView';

type State = NonNullable<PublicState>;
type Match = State['matches'][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    label: '小组赛 R1',
    roundKey: 'GROUP',
    bestOf: 1,
    scheduledAt: '2026-07-01T12:00:00.000Z',
    status: 'SCHEDULED',
    isWalkover: false,
    teamA: { id: 'ta', name: '蓝队' },
    teamB: { id: 'tb', name: '红队' },
    winnerTeamId: null,
    groupId: 'g1',
    ...overrides,
  };
}

function state(): State {
  return {
    tournament: { id: 't1', name: '夏季联赛', kind: 'GROUP_KNOCKOUT', status: 'ACTIVE' },
    matches: [match()],
    standings: [
      {
        groupId: 'g1',
        name: 'A组',
        teams: { ta: '蓝队', tb: '红队' },
        rows: [
          { teamId: 'ta', played: 2, wins: 2, losses: 0, points: 6, rank: 1, tied: false },
          { teamId: 'tb', played: 2, wins: 1, losses: 1, points: 3, rank: 2, tied: false },
        ],
      },
    ],
    bracket: [
      { roundKey: 'SEMIFINAL', matches: [{ id: 'b1', label: '半决赛 1', teamAId: 'ta', teamBId: 'tb', winnerTeamId: null, status: 'SCHEDULED' }] },
    ],
  };
}

describe('TournamentArenaView', () => {
  it('renders the arena loading state', () => {
    render(<TournamentArenaView loaded={false} state={null} />);

    expect(screen.getByText('赛事信号加载中...')).toBeInTheDocument();
  });

  it('renders the public empty state when no tournament exists', () => {
    render(<TournamentArenaView loaded state={null} />);

    expect(screen.getByRole('heading', { name: '暂未创建赛事' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });

  it('renders the Tech Arena Console shell with existing sections', () => {
    render(<TournamentArenaView loaded state={state()} />);

    expect(screen.getByText('LOL-SYSTEM / PUBLIC ARENA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '夏季联赛进入公共竞技场' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /观看下一场/ })).toHaveAttribute('href', '/tournament/match/m1');
    expect(screen.getByRole('tab', { name: '赛程' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '小组赛' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '对阵图' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '数据榜' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run focused component tests**

Run: `npm run test -- src/components/tournament/arena/TournamentArenaView.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run related public tournament tests**

Run: `npm run test -- src/lib/tournament/arena-view-model.test.ts src/components/tournament/arena/TournamentArenaView.test.tsx src/components/tournament/ScheduleList.test.tsx src/components/tournament/LeaderboardView.test.tsx`

Expected: PASS. Existing `ScheduleList` and `LeaderboardView` tests must stay green because their components remain reused.

- [ ] **Step 4: Commit**

```bash
git add src/components/tournament/arena/TournamentArenaView.test.tsx
git commit -m "test: cover public arena console states"
```

---

### Task 5: Browser Verification and Mobile Overflow Check

**Files:**
- No source files required unless verification exposes a concrete issue.
- If source edits are needed, modify the exact arena component or `.arena-console` CSS that causes the issue.

**Interfaces:**
- Consumes: Completed `/tournament` arena implementation.
- Produces: Desktop and mobile screenshots proving the page is not the old plain tab container and has no horizontal overflow.

- [ ] **Step 1: Start the local dev server**

Run:

```bash
npm run dev
```

Expected: Next.js starts and prints a local URL, normally `http://localhost:3000`.

- [ ] **Step 2: Capture desktop and mobile screenshots**

Run this Playwright script from the repo root after the dev server is ready:

```bash
node <<'EOF'
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  for (const target of [
    { name: 'desktop', width: 1440, height: 1100 },
    { name: 'mobile', width: 390, height: 1200 },
  ]) {
    const page = await browser.newPage({ viewport: { width: target.width, height: target.height } });
    await page.goto('http://localhost:3000/tournament', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `/tmp/lol-system-public-arena-${target.name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${target.name} overflow=${overflow}`);
    await page.close();
  }
  await browser.close();
})();
EOF
```

Expected:

```text
desktop overflow=0
mobile overflow=0
```

- [ ] **Step 3: Inspect screenshot acceptance criteria**

Open or send these files for review:

```text
/tmp/lol-system-public-arena-desktop.png
/tmp/lol-system-public-arena-mobile.png
```

Expected visual result:
- Desktop first screen shows HUD, large hero, stat cards, signal map, next match, and hot signals.
- Mobile stacks HUD, hero, next match, and signals vertically with no clipped button text.
- The old plain first-screen tab container is no longer the first visual impression.
- Existing below-fold tabs remain visible and usable.

- [ ] **Step 4: Fix verification issues if present**

If `mobile overflow` is greater than `0`, inspect the widest element with:

```bash
node <<'EOF'
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 1200 } });
  await page.goto('http://localhost:3000/tournament', { waitUntil: 'networkidle' });
  const offenders = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, width: rect.width, right: rect.right };
      })
      .filter((item) => item.right > viewport + 1 || item.width > viewport + 1)
      .slice(0, 10);
  });
  console.log(JSON.stringify(offenders, null, 2));
  await browser.close();
})();
EOF
```

Expected: The output identifies the arena element that needs a responsive class fix, usually a `grid`, `truncate`, or fixed-width visual. Apply the smallest fix and repeat Steps 2 and 3.

- [ ] **Step 5: Stop the dev server**

Press `Ctrl-C` in the dev-server terminal session.

- [ ] **Step 6: Commit screenshot-driven fixes**

If source files changed during browser verification:

```bash
git add src/components/tournament/arena src/app/globals.css
git commit -m "fix: tighten public arena responsive layout"
```

If no files changed, do not create an empty commit.

---

### Task 6: Final Quality Gate and Handoff

**Files:**
- No new source files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified implementation ready for user review.

- [ ] **Step 1: Run the focused test set**

Run:

```bash
npm run test -- src/lib/tournament/arena-view-model.test.ts src/components/tournament/arena/TournamentArenaView.test.tsx src/components/tournament/ScheduleList.test.tsx src/components/tournament/LeaderboardView.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: No unexpected modified files. Untracked screenshot files under `/tmp` are outside the repo and do not matter.

- [ ] **Step 4: Final user-facing summary**

Report:
- `/tournament` now uses the Tech Arena Console shell.
- The phase covers public tournament page only.
- Atlas remains reserved as a later skin.
- Tests and typecheck results.
- Screenshot paths or attached images.

---

## Self-Review

- Spec coverage: Tasks cover pure helpers, cockpit components, replacement of `PublicTournamentView`, existing below-fold tabs, scoped visual style, mobile overflow verification, and screenshot review. Other public pages are explicitly phase two. Atlas is explicitly excluded from implementation while component names and CSS variables avoid locking the structure to cyan-only naming.
- Placeholder scan: The plan contains no `TBD`, no `TODO`, no incomplete test instruction, and no references to undefined helper names.
- Type consistency: Component props consume the exact Task 1 exports. `TournamentArenaView` accepts `PublicState` and `loaded`, matching `useTournamentState()` output. Existing content components receive the same props they receive today.
