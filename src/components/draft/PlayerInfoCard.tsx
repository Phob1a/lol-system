'use client';

import type { RegistrationRef } from '@/lib/teams/preview';
import { formatCost } from '@/lib/costs';
import { PosPip, type Position } from '@/components/nexus/PosPip';

/**
 * Normalize a stored position value to the canonical PosPip code.
 * Tolerates legacy short codes (JG / SUP) alongside the Prisma enum.
 */
const POS_NORMALIZE: Record<string, Position> = {
  TOP: 'TOP',
  JG: 'JUNGLE',
  JUNGLE: 'JUNGLE',
  MID: 'MID',
  ADC: 'ADC',
  SUP: 'SUPPORT',
  SUPPORT: 'SUPPORT',
};

function normalizePos(pos: string): Position | null {
  return POS_NORMALIZE[pos] ?? null;
}

/** NEXUS player mini-file — dark surface, accent cost, PosPip lane glyphs. */
export function PlayerInfoCard({ player }: { player: RegistrationRef }) {
  return (
    <div
      className="w-[260px] space-y-2.5 rounded-[var(--radius-nexus)] border border-nexus-line p-3"
      style={{
        background: 'rgb(var(--panel))',
        boxShadow: '0 8px 28px rgb(0 0 0 / 0.5)',
      }}
    >
      {/* Header: name + cost */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-nexus-ink">
            {player.nickname}
          </p>
          <p className="font-mono text-[10px] text-nexus-faint truncate">@{player.gameId}</p>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
            COST
          </p>
          <p
            className="font-mono tabular-nums text-base font-semibold"
            style={{ color: 'rgb(var(--accent-n))' }}
          >
            {formatCost(player.cost)}
            <span className="ml-0.5 font-mono text-[9px] text-nexus-faint">CR</span>
          </p>
        </div>
      </div>

      {/* Primary positions */}
      <div>
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
          PRIMARY
        </p>
        <div className="flex flex-wrap gap-1">
          {player.primaryPositions.map((p) => {
            const pos = normalizePos(p);
            return pos ? <PosPip key={`p-${p}`} pos={pos} on size={24} /> : null;
          })}
        </div>
      </div>

      {/* Secondary positions */}
      {player.secondaryPositions.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
            SECONDARY
          </p>
          <div className="flex flex-wrap gap-1">
            {player.secondaryPositions.map((p) => {
              const pos = normalizePos(p);
              return pos ? <PosPip key={`s-${p}`} pos={pos} size={24} /> : null;
            })}
          </div>
        </div>
      )}

      {/* Availability — weekly match/training time (captain-facing) */}
      {player.availability && (
        <div>
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
            可参赛时间
          </p>
          <p className="text-[11px] leading-relaxed text-nexus-dim">
            {player.availability}
          </p>
        </div>
      )}
    </div>
  );
}
