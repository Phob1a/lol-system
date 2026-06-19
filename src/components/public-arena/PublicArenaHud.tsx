import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';

export type ArenaSignal = {
  label: string;
  detail?: string;
};

type PublicArenaHudProps = {
  eyebrow: string;
  title: string;
  signals?: ArenaSignal[];
  actions?: ReactNode;
};

export function PublicArenaHud({
  eyebrow,
  title,
  signals = [],
  actions,
}: PublicArenaHudProps) {
  return (
    <header className="relative z-10 flex flex-col gap-3 border-b border-cyan-300/15 px-4 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
          {eyebrow}
        </p>
        <p className="truncate text-lg font-semibold text-white md:text-xl">{title}</p>
      </div>

      {signals.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200/80">
          {signals.map((signal) => (
            <span
              key={`${signal.label}-${signal.detail ?? ''}`}
              className="inline-flex h-8 items-center gap-2 rounded border border-cyan-200/20 bg-cyan-200/5 px-3"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-200" />
              {signal.label}
              {signal.detail ? <span className="text-slate-400">{signal.detail}</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
