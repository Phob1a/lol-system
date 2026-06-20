'use client';

import Link from 'next/link';
import { ArenaAtmosphere } from '@/components/public-arena';
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
        <ArenaAtmosphere />
        <div className="arena-panel arena-corner relative z-10 w-full max-w-md p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
            PUBLIC ARENA
          </p>
          <p className="mt-3 text-sm text-slate-300">赛事信号加载中...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="arena-console relative -mx-4 -my-6 flex items-center justify-center px-4 py-24 md:-mx-8">
        <ArenaAtmosphere />
        <div className="arena-panel arena-corner relative z-10 w-full max-w-lg p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
            SYSTEM STANDBY
          </p>
          <h2 className="mt-4 text-2xl font-black text-white">暂未创建赛事</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            公开竞技场会在赛事创建后显示赛程、对阵图和数据榜入口。
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded border border-cyan-200/35 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-50"
          >
            返回首页
          </Link>
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
      <ArenaAtmosphere />
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
