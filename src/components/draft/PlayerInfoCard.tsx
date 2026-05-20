'use client';

import type { RegistrationRef } from '@/lib/teams/preview';
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
        'inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-sm border text-[10px] font-bold',
        filled
          ? 'bg-primary border-primary text-primary-foreground'
          : 'bg-transparent border-border text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

export function PlayerInfoCard({ player }: { player: RegistrationRef }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      {/* Header: name + cost */}
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{player.nickname}</p>
          <p className="text-xs text-muted-foreground">@{player.gameId}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">COST</p>
          <p className="text-base font-semibold text-foreground leading-tight">
            {player.cost}
            <span className="text-[9px] text-muted-foreground ml-0.5">CR</span>
          </p>
        </div>
      </div>

      {/* Primary positions */}
      <div>
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">PRIMARY</p>
        <div className="flex gap-1 flex-wrap">
          {player.primaryPositions.map((p) => (
            <PosChip key={`p-${p}`} pos={p} filled />
          ))}
        </div>
      </div>

      {/* Secondary positions */}
      {player.secondaryPositions.length > 0 && (
        <div>
          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">SECONDARY</p>
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
