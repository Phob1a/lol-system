'use client';

import { useState } from 'react';
import { useTournamentState } from '@/hooks/useTournamentState';
import { ScheduleList } from '@/components/tournament/ScheduleList';
import { GroupStandings } from '@/components/tournament/GroupStandings';
import { BracketView } from '@/components/tournament/BracketView';
import { LeaderboardView } from '@/components/tournament/LeaderboardView';
import Readout from '@/components/nexus/Readout';
import Kicker from '@/components/nexus/Kicker';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
type TabKey = 'schedule' | 'standings' | 'bracket' | 'leaderboard';

const TABS: Array<{ key: TabKey; label: string; idx: string }> = [
  { key: 'schedule',    label: '赛程',  idx: 'i.'   },
  { key: 'standings',   label: '积分榜', idx: 'ii.'  },
  { key: 'bracket',    label: '对阵图', idx: 'iii.' },
  { key: 'leaderboard', label: '数据榜', idx: 'iv.'  },
];

// ---------------------------------------------------------------------------
// Nexus tab bar
// ---------------------------------------------------------------------------
function NexusTabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div
      className="flex overflow-x-auto border-b border-nexus-line px-1"
      role="tablist"
      aria-label="赛事中心标签"
    >
      {TABS.map(({ key, label, idx }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={[
              // layout
              'flex shrink-0 items-center gap-[7px] px-3 py-3 min-[430px]:px-4',
              // bottom border as active indicator
              'border-b-2 -mb-px',
              'transition-colors duration-100',
              // active vs idle
              isActive
                ? 'border-nexus-accent text-nexus-accent'
                : [
                    'border-transparent',
                    'text-nexus-dim hover:text-nexus-ink hover:border-nexus-line/60',
                  ].join(' '),
            ].join(' ')}
          >
            <Readout
              className={[
                'text-[11px]',
                isActive ? 'text-nexus-accent' : 'text-nexus-faint',
              ].join(' ')}
            >
              {idx}
            </Readout>
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em]">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function PublicTournamentView() {
  const { state, loaded } = useTournamentState();
  const [tab, setTab] = useState<TabKey>('schedule');

  // Loading skeleton
  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <Kicker className="animate-pulse">加载中…</Kicker>
      </div>
    );
  }

  // No tournament yet (SETUP / REGISTRATION phase)
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Kicker>赛事中心</Kicker>
        <p className="text-nexus-faint text-sm font-mono">暂未创建赛事</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Nexus tab bar */}
      <NexusTabBar active={tab} onChange={setTab} />

      {/* Tab content */}
      <div className="px-3 pt-5 min-[430px]:px-[18px] min-[1180px]:px-[22px]">
        {tab === 'schedule' && (
          <ScheduleList matches={state.matches} standings={state.standings} />
        )}

        {tab === 'standings' && (
          <GroupStandings standings={state.standings} />
        )}

        {tab === 'bracket' && (
          <BracketView
            bracket={state.bracket}
            standings={state.standings}
            matches={state.matches}
          />
        )}

        {tab === 'leaderboard' && (
          <LeaderboardView />
        )}
      </div>
    </div>
  );
}
