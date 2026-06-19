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
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
        HOT SIGNALS
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {signals.map((signal) => {
          const Icon = icons[signal.id as keyof typeof icons] ?? Activity;

          return (
            <article key={signal.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {signal.label}
                </p>
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
