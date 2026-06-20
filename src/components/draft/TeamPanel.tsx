'use client';

import type { TeamPreview } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { TeamHoverCard, type TeamHoverSummary } from '@/components/draft/TeamHoverCard';
import Panel from '@/components/nexus/Panel';
import Kicker from '@/components/nexus/Kicker';
import Chip from '@/components/nexus/Chip';
import { PosPip } from '@/components/nexus/PosPip';
import { SegBudget } from '@/components/nexus/charts/SegBudget';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

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

  // Estimate maxBudget as sum of all slot costs + remaining budget
  const maxBudget = team.slots.reduce(
    (acc, s) => acc + (s.player?.cost ?? 0),
    team.budgetLeft,
  );

  return (
    <Panel
      className="p-[14px]"
      style={isOwn ? { borderColor: 'rgb(var(--accent-n) / 0.5)' } : undefined}
    >
      <TeamHoverCard team={hoverTeam}>
        <div>
          {/* Header: captain name + budget */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={cn(
                    'font-display font-semibold text-[14.5px] leading-tight truncate',
                    isOwn ? 'text-nexus-accent' : 'text-nexus-ink',
                  )}
                >
                  {team.captainNickname}
                </span>
                {isOwn && <Chip variant="ac">MINE</Chip>}
              </div>
              <Kicker>@{team.captainGameId}</Kicker>
            </div>
            <div className="text-right shrink-0">
              <Kicker className="mb-0.5">预算余</Kicker>
              <div
                className="font-mono tabular-nums text-[13px] font-semibold"
                style={{ color: 'rgb(var(--accent-n))' }}
              >
                {formatCost(team.budgetLeft)}
                <span className="font-mono text-[9px] text-nexus-faint ml-0.5">CR</span>
              </div>
            </div>
          </div>

          {/* Position pip summary row */}
          <div className="flex gap-[6px] mb-2.5">
            {POSITIONS.map((p) => (
              <PosPip
                key={p}
                pos={p}
                on={filledPositions.includes(p)}
                size={24}
              />
            ))}
          </div>

          {/* Budget bar */}
          <SegBudget
            used={team.budgetLeft}
            total={maxBudget > 0 ? maxBudget : 1}
            segs={16}
          />
        </div>
      </TeamHoverCard>

      {/* Roster slots */}
      <div className="mt-2.5 flex flex-col gap-[3px]">
        {team.slots.map((slot) => {
          const row = (
            <div
              className="grid items-center gap-2 px-2 py-1.5 border border-nexus-line rounded-[var(--radius-nexus)]"
              style={{
                gridTemplateColumns: '48px 1fr auto',
                background: 'rgb(var(--panel-2))',
              }}
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-nexus-faint">
                {POSITION_LABEL[slot.position]}
              </span>
              {slot.player ? (
                <span className="min-w-0 font-display text-[12.5px] text-nexus-ink truncate">
                  {slot.player.nickname}
                  <span className="ml-1.5 font-mono text-[9px] text-nexus-faint">
                    @{slot.player.gameId}
                  </span>
                </span>
              ) : (
                <span className="font-mono text-[10px] text-nexus-faint/50">— 空缺 —</span>
              )}
              <span
                className={cn(
                  'font-mono tabular-nums text-[11px]',
                  slot.player ? 'text-nexus-accent' : 'text-nexus-faint/50',
                )}
              >
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
    </Panel>
  );
}
