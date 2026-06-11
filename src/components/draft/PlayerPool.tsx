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
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  players: RegistrationForPool[];
  /** Per-row action area (e.g. "选他" button when on the clock). */
  renderActions?: (player: RegistrationForPool) => React.ReactNode;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gameId-asc', label: '默认' },
  { value: 'primary-asc', label: '按位置' },
  { value: 'cost-asc', label: '费用 ↑' },
  { value: 'cost-desc', label: '费用 ↓' },
];

const PICKED_OPTIONS: { value: NonNullable<PlayerFilter['pickedStatus']>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unpicked', label: '未选' },
  { value: 'picked', label: '已选' },
];

/** Chinese single-character marker for a position value. */
const POS_CHAR: Record<string, string> = {
  TOP: '上',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUPPORT: '辅',
};

function PosChip({ pos, filled }: { pos: string; filled?: boolean }) {
  const char = POS_CHAR[pos] ?? pos[0];
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-medium',
        filled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-transparent text-muted-foreground',
      )}
    >
      {char}
    </span>
  );
}

/** Segmented toggle button used across the filter panel. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-transparent text-muted-foreground hover:border-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function PlayerPool({ players, renderActions }: Props) {
  const [filter, setFilter] = useState<PlayerFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Raw strings for the cost-range inputs, kept separate from the parsed
  // numbers in `filter` so a partially-typed decimal (e.g. "12.") survives.
  const [costMinInput, setCostMinInput] = useState('');
  const [costMaxInput, setCostMaxInput] = useState('');

  const visible = useMemo(
    () => sortPlayers(filterPlayers(players, filter), sort),
    [players, filter, sort],
  );

  // Count of active conditions inside the collapsible panel. Search is excluded
  // (it stays visible above); sort is not a "filter" and is not counted.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if ((filter.primaryPositions?.length ?? 0) > 0) n++;
    if ((filter.secondaryPositions?.length ?? 0) > 0) n++;
    if (filter.costMin != null) n++;
    if (filter.costMax != null) n++;
    if ((filter.pickedStatus ?? 'all') !== 'all') n++;
    return n;
  }, [filter]);

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
    setFiltersOpen(false);
    setCostMinInput('');
    setCostMaxInput('');
  }

  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      {/* ── Filter region ── */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        {/* Search — always visible */}
        <Input
          placeholder="搜索昵称 / 游戏 ID"
          value={filter.search ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          className="h-9 text-sm"
        />

        {/* Status bar: count · 筛选 toggle · 重置 */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">显示 {visible.length}</span> / {players.length} 人
          </span>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded border px-2.5 py-1 transition-colors',
              filtersOpen
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            筛选 {filtersOpen ? '▴' : '▾'}
            {activeFilterCount > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium',
                  filtersOpen
                    ? 'bg-primary-foreground text-primary'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            重置
          </button>
        </div>

        {/* Collapsible filter panel */}
        {filtersOpen && (
          <div className="space-y-3 border-t pt-3">
            {/* Sort */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">排序</p>
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={sort === opt.value}
                    onClick={() => setSort(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Primary positions */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">主位置</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITION_OPTIONS.map((p) => (
                  <FilterChip
                    key={p.value}
                    active={!!filter.primaryPositions?.includes(p.value)}
                    onClick={() => togglePos('primaryPositions', p.value)}
                  >
                    {p.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Secondary positions */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">副位置</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITION_OPTIONS.map((p) => (
                  <FilterChip
                    key={p.value}
                    active={!!filter.secondaryPositions?.includes(p.value)}
                    onClick={() => togglePos('secondaryPositions', p.value)}
                  >
                    {p.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Cost range */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">费用区间</p>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="最低"
                  value={costMinInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCostMinInput(raw);
                    const n = Number(raw);
                    setFilter((f) => ({
                      ...f,
                      costMin: raw.trim() === '' || Number.isNaN(n) ? undefined : n,
                    }));
                  }}
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="最高"
                  value={costMaxInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCostMaxInput(raw);
                    const n = Number(raw);
                    setFilter((f) => ({
                      ...f,
                      costMax: raw.trim() === '' || Number.isNaN(n) ? undefined : n,
                    }));
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Picked status */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">选取状态</p>
              <div className="flex flex-wrap gap-1.5">
                {PICKED_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={(filter.pickedStatus ?? 'all') === opt.value}
                    onClick={() => setFilter((f) => ({ ...f, pickedStatus: opt.value }))}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Player card grid ── */}
      <div
        data-testid="player-pool-grid"
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}
      >
        {visible.map((p) => (
          <PlayerHoverCard key={p.id} player={p}>
            <div
              className={cn(
                'flex h-full min-h-[116px] flex-col justify-between rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40',
                p.isPicked && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{p.nickname}</span>
                    {p.isPicked && (
                      <Badge variant="outline" className="h-auto shrink-0 px-1.5 py-0 text-[10px]">
                        已选
                      </Badge>
                    )}
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">@{p.gameId}</span>
                </div>

                <div className="shrink-0 rounded-md border bg-muted/30 px-2 py-1 text-right leading-tight">
                  <div className="text-sm font-semibold text-foreground">{p.cost}</div>
                  <div className="text-[10px] text-muted-foreground">费用</div>
                </div>
              </div>

              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {p.primaryPositions.map((pos) => (
                    <PosChip key={`p-${pos}`} pos={pos} filled />
                  ))}
                  {p.secondaryPositions.map((pos) => (
                    <PosChip key={`s-${pos}`} pos={pos} />
                  ))}
                </div>
                {renderActions && <div className="shrink-0">{renderActions(p)}</div>}
              </div>
            </div>
          </PlayerHoverCard>
        ))}
        {visible.length === 0 && (
          <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            没有匹配的选手
          </div>
        )}
      </div>
    </div>
  );
}
