import { Activity, Database, RadioTower, ShieldCheck } from 'lucide-react';
import type {
  ArenaMatch,
  ArenaStats,
  PublicTournamentState,
} from '@/lib/tournament/arena-view-model';
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
          LOL-SYSTEM / PUBLIC ARENA
        </p>
        <h1 className="truncate text-lg font-semibold text-white md:text-xl">{tournament.name}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200/80">
        {signals.map((signal) => {
          const Icon = signal.icon;

          return (
            <span
              key={signal.label}
              className="inline-flex h-8 items-center gap-2 rounded border border-cyan-200/20 bg-cyan-200/5 px-3"
            >
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
