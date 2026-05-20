'use client';

import { useMemo, useState } from 'react';
import {
  filterPlayers,
  sortPlayers,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type RegistrationForPool,
  type PlayerFilter,
  type SortKey,
} from '@/lib/filters';
import type { PositionLiteral } from '@/lib/players/schema';
import { POSITION_OPTIONS } from '@/components/players/positions';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  players: RegistrationForPool[];
  /** Per-row action area (e.g. "选他" button when on the clock). */
  renderActions?: (player: RegistrationForPool) => React.ReactNode;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gameId-asc', label: 'BY ID' },
  { value: 'primary-asc', label: 'BY POS' },
  { value: 'cost-asc', label: 'COST ↑' },
  { value: 'cost-desc', label: 'COST ↓' },
];

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
            ? 'bg-transparent border-muted-foreground text-muted-foreground'
            : 'bg-transparent border-border text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

export function PlayerPool({ players, renderActions }: Props) {
  const [filter, setFilter] = useState<PlayerFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  const visible = useMemo(
    () => sortPlayers(filterPlayers(players, filter), sort),
    [players, filter, sort],
  );

  function togglePos(field: 'primaryPositions' | 'secondaryPositions', pos: PositionLiteral) {
    setFilter((f) => {
      const cur = f[field] ?? [];
      const next = cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos];
      return { ...f, [field]: next };
    });
  }

  function reset() {
    setFilter(DEFAULT_FILTER);
    setSort(DEFAULT_SORT);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Filter / sort panel */}
      <div className="rounded-lg border bg-card p-3 space-y-2.5">
        {/* Row 1: search + sort + reset */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2.5 items-center">
          <Input
            placeholder="search nickname or gameId…"
            value={filter.search ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            className="h-8 text-xs"
          />
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={cn(
                  'px-2 py-1 text-[10px] rounded border transition-colors',
                  sort === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={reset}
            className="px-3 py-1 text-[10px] rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            ⟲ RESET
          </button>
        </div>

        {/* Row 2: position filters */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              PRIMARY (OR)
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {POSITION_OPTIONS.map((p) => {
                const on = filter.primaryPositions?.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePos('primaryPositions', p.value)}
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded border transition-colors',
                      on
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground',
                    )}
                  >
                    {p.value}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              SECONDARY (OR)
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {POSITION_OPTIONS.map((p) => {
                const on = filter.secondaryPositions?.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePos('secondaryPositions', p.value)}
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded border transition-colors',
                      on
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground',
                    )}
                  >
                    {p.value}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 3: cost range + picked status */}
        <div className="grid grid-cols-3 gap-2.5">
          <NumField
            label="COST ≥"
            value={filter.costMin}
            onChange={(v) => setFilter((f) => ({ ...f, costMin: v }))}
          />
          <NumField
            label="COST ≤"
            value={filter.costMax}
            onChange={(v) => setFilter((f) => ({ ...f, costMax: v }))}
          />
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              PICKED
            </span>
            <div className="flex gap-1 mt-1">
              {(['all', 'unpicked', 'picked'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter((f) => ({ ...f, pickedStatus: s }))}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] rounded border transition-colors',
                    (filter.pickedStatus ?? 'all') === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground',
                  )}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 4: count */}
        <p className="text-[10px] text-muted-foreground">
          showing {visible.length} of {players.length}
        </p>
      </div>

      {/* Player grid */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {visible.map((p) => (
          <div
            key={p.id}
            className={cn(
              'grid gap-1.5 px-2.5 py-2 rounded border',
              p.isPicked ? 'opacity-50' : '',
            )}
            style={{ gridTemplateColumns: '1fr auto' }}
          >
            <div className="min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground truncate">{p.nickname}</span>
                {p.isPicked && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-auto">
                    PICKED
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">@{p.gameId}</span>
              <div className="flex gap-1 mt-0.5">
                {p.primaryPositions.map((pos) => (
                  <PosChip key={`p-${pos}`} pos={pos} filled />
                ))}
                {p.secondaryPositions.map((pos) => (
                  <PosChip key={`s-${pos}`} pos={pos} />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end justify-between gap-1.5">
              <div className="text-right">
                <span className="text-base font-semibold text-foreground">{p.cost}</span>
                <span className="text-[9px] text-muted-foreground ml-0.5">CR</span>
              </div>
              {renderActions && <div>{renderActions(p)}</div>}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="col-span-full py-6 text-center text-xs text-muted-foreground border border-dashed rounded">
            没有匹配的选手
          </div>
        )}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <Input
        type="number"
        step="any"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="mt-1 h-7 text-xs"
      />
    </div>
  );
}
