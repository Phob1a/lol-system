'use client';

import type { TeamPreview } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { TeamHoverCard, type TeamHoverSummary } from '@/components/draft/TeamHoverCard';
import { Badge } from '@/components/ui/badge';
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

function PosChip({
  pos,
  filled,
  dim,
}: {
  pos: string;
  filled?: boolean;
  dim?: boolean;
}) {
  const letter = POS_LETTER[pos] ?? pos[0];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-sm border text-[10px] font-bold',
        filled
          ? 'bg-primary border-primary text-primary-foreground'
          : dim
            ? 'bg-transparent border-muted-foreground/40 text-muted-foreground/40'
            : 'bg-transparent border-border text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

type Props = {
  team: TeamPreview;
  isOwn?: boolean;
};

export function TeamPanel({ team, isOwn }: Props) {
  const filledPositions = team.slots.filter((s) => s.player).map((s) => s.position);
  const hoverTeam: TeamHoverSummary = {
    captainNickname: team.captainNickname,
    captainGameId: team.captainGameId,
    budgetLeft: team.budgetLeft,
    slots: team.slots,
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 space-y-2',
        isOwn ? 'border-primary/60 bg-primary/5' : '',
      )}
    >
      <TeamHoverCard team={hoverTeam}>
        <div className="space-y-2">
          {/* Header: captain name + budget */}
          <div className="flex justify-between items-baseline gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-sm font-semibold truncate',
                    isOwn ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {team.captainNickname}
                </span>
                {isOwn && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-auto">
                    MINE
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">@{team.captainGameId}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">BUDGET</p>
              <p className="text-sm font-semibold text-foreground leading-tight">
                {formatCost(team.budgetLeft)}
                <span className="text-[9px] text-muted-foreground ml-0.5">CR</span>
              </p>
            </div>
          </div>

          {/* Position summary row */}
          <div className="flex gap-1">
            {(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const).map((p) => (
              <PosChip
                key={p}
                pos={p}
                filled={filledPositions.includes(p)}
                dim={!filledPositions.includes(p)}
              />
            ))}
          </div>
        </div>
      </TeamHoverCard>

      {/* Roster slots */}
      <div className="flex flex-col gap-0.5">
        {team.slots.map((slot) => {
          const row = (
            <div
              className="grid items-center gap-2 px-1.5 py-1 rounded border border-border text-xs"
              style={{ gridTemplateColumns: '46px 1fr auto' }}
            >
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                {POSITION_LABEL[slot.position]}
              </span>
              {slot.player ? (
                <span className="min-w-0 text-foreground truncate">
                  {slot.player.nickname}
                  <span className="ml-1.5 text-[9px] text-muted-foreground">
                    @{slot.player.gameId}
                  </span>
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50">— empty —</span>
              )}
              <span className={cn('text-xs font-medium', slot.player ? 'text-foreground' : 'text-muted-foreground/50')}>
                {slot.player ? formatCost(slot.player.cost) : '—'}
              </span>
            </div>
          );
          return slot.player ? (
            <PlayerHoverCard key={slot.position} player={slot.player}>
              {row}
            </PlayerHoverCard>
          ) : (
            <div key={slot.position}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}
