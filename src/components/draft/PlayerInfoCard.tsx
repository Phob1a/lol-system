'use client';

import type { RegistrationRef } from '@/lib/teams/preview';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

/** Abbreviation letter for a position value */
const POS_LETTER: Record<string, string> = {
  TOP: 'T',
  JG: 'J',
  JUNGLE: 'J',
  MID: 'M',
  ADC: 'A',
  SUP: 'S',
  SUPPORT: 'S',
};

function PosChip({ pos, filled }: { pos: string; filled?: boolean }) {
  const letter = POS_LETTER[pos] ?? pos[0];
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-[10px] font-bold shadow-[0_0_12px_rgba(94,231,255,0.12)]',
        filled
          ? 'border-cyan-200/45 bg-cyan-200 text-slate-950'
          : 'border-cyan-200/20 bg-cyan-200/[0.06] text-cyan-100/75',
      )}
    >
      {letter}
    </span>
  );
}

export function PlayerInfoCard({ player }: { player: RegistrationRef }) {
  return (
    <div className="arena-panel arena-corner w-[280px] space-y-3 overflow-hidden p-3 text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            Player Signal
          </p>
          <p className="mt-1 truncate text-sm font-bold text-white">{player.nickname}</p>
          <p className="text-xs text-slate-400">@{player.gameId}</p>
        </div>
        <div className="shrink-0 rounded border border-amber-200/25 bg-amber-200/10 px-2 py-1 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-100/70">
            COST
          </p>
          <p className="text-base font-black leading-tight text-white">
            {formatCost(player.cost)}
            <span className="ml-0.5 text-[9px] text-amber-100/70">CR</span>
          </p>
        </div>
      </div>

      <div className="rounded border border-cyan-200/15 bg-slate-950/35 p-2">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-cyan-200/70">
          PRIMARY
        </p>
        <div className="flex gap-1 flex-wrap">
          {player.primaryPositions.map((p) => (
            <PosChip key={`p-${p}`} pos={p} filled />
          ))}
        </div>
      </div>

      {player.secondaryPositions.length > 0 && (
        <div className="rounded border border-cyan-200/10 bg-white/[0.03] p-2">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            SECONDARY
          </p>
          <div className="flex gap-1 flex-wrap">
            {player.secondaryPositions.map((p) => (
              <PosChip key={`s-${p}`} pos={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
