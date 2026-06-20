'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
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
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import { PosPip } from '@/components/nexus/PosPip';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

type Props = {
  players: RegistrationForPool[];
  /** Per-row action area (e.g. "选他" button when on the clock). */
  renderActions?: (player: RegistrationForPool) => React.ReactNode;
  /** Return drag payload for eligible pick cards; null keeps the card static. */
  getDragData?: (player: RegistrationForPool) => Record<string, unknown> | null;
  /** Fallback pick request for double-click/double-tap on an eligible draggable card. */
  onPickRequest?: (player: RegistrationForPool) => void;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gameId-asc', label: '默认' },
  { value: 'primary-asc', label: '位置' },
  { value: 'cost-asc', label: '费用↑' },
  { value: 'cost-desc', label: '费用↓' },
];

const PICKED_OPTIONS: { value: NonNullable<PlayerFilter['pickedStatus']>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unpicked', label: '未选' },
  { value: 'picked', label: '已选' },
];

/** Nexus-styled toggle chip button */
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
        'h-6 px-3 font-mono text-[10px] uppercase tracking-[0.1em] border rounded-[var(--radius-nexus)] transition-colors cursor-pointer',
        active
          ? 'border-nexus-accent/60 text-nexus-accent'
          : 'border-nexus-line text-nexus-dim hover:border-nexus-ink hover:text-nexus-ink',
      )}
    >
      {children}
    </button>
  );
}

export function PlayerPool({ players, renderActions, getDragData, onPickRequest }: Props) {
  const [filter, setFilter] = useState<PlayerFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [costMinInput, setCostMinInput] = useState('');
  const [costMaxInput, setCostMaxInput] = useState('');

  const visible = useMemo(
    () => sortPlayers(filterPlayers(players, filter), sort),
    [players, filter, sort],
  );

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
    <div className="flex flex-col">
      <PanelHead
        title={`选手池 · ${visible.length}/${players.length}`}
        actions={
          <span className="font-mono text-[10px] text-nexus-faint">点选预览</span>
        }
      />

      {/* ── Filter region ── */}
      <div className="p-3 border-b border-nexus-line space-y-2.5">
        {/* Search */}
        <input
          className={cn(
            'w-full h-9 px-3 text-[13px]',
            'bg-transparent border border-nexus-line rounded-[var(--radius-nexus)]',
            'text-nexus-ink placeholder:text-nexus-faint font-display',
            'focus:outline-none focus:border-nexus-accent transition-colors',
          )}
          placeholder="搜索昵称 / 游戏 ID"
          value={filter.search ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
        />

        {/* Status bar: filter toggle + reset */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              'ml-auto h-6 px-3 font-mono text-[10px] uppercase tracking-[0.12em] border rounded-[var(--radius-nexus)] transition-colors cursor-pointer flex items-center gap-1',
              filtersOpen
                ? 'border-nexus-accent/60 text-nexus-accent'
                : 'border-nexus-line text-nexus-dim hover:border-nexus-ink hover:text-nexus-ink',
            )}
          >
            筛选 {filtersOpen ? '▴' : '▾'}
            {activeFilterCount > 0 && (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px]"
                style={{
                  background: 'rgb(var(--accent-n))',
                  color: 'rgb(var(--bg))',
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="h-6 px-3 font-mono text-[10px] uppercase tracking-[0.12em] border border-nexus-line rounded-[var(--radius-nexus)] text-nexus-dim hover:border-nexus-ink hover:text-nexus-ink transition-colors cursor-pointer"
          >
            重置
          </button>
        </div>

        {/* Collapsible filter panel */}
        {filtersOpen && (
          <div className="space-y-3 pt-2 border-t border-nexus-line">
            {/* Sort */}
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-nexus-faint mb-1.5">排序</p>
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
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-nexus-faint mb-1.5">主位置</p>
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
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-nexus-faint mb-1.5">副位置</p>
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
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-nexus-faint mb-1.5">费用区间</p>
              <div className="flex items-center gap-2">
                <input
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
                  className={cn(
                    'h-8 flex-1 px-2 text-xs font-mono',
                    'bg-transparent border border-nexus-line rounded-[var(--radius-nexus)]',
                    'text-nexus-ink placeholder:text-nexus-faint',
                    'focus:outline-none focus:border-nexus-accent transition-colors',
                  )}
                />
                <span className="text-nexus-faint font-mono text-xs">–</span>
                <input
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
                  className={cn(
                    'h-8 flex-1 px-2 text-xs font-mono',
                    'bg-transparent border border-nexus-line rounded-[var(--radius-nexus)]',
                    'text-nexus-ink placeholder:text-nexus-faint',
                    'focus:outline-none focus:border-nexus-accent transition-colors',
                  )}
                />
              </div>
            </div>

            {/* Picked status */}
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-nexus-faint mb-1.5">选取状态</p>
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
        className="grid gap-2 p-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}
      >
        {visible.map((p) => (
          <PlayerPoolCard
            key={p.id}
            player={p}
            dragData={getDragData?.(p) ?? null}
            onPickRequest={onPickRequest}
            action={renderActions?.(p)}
          />
        ))}
        {visible.length === 0 && (
          <div
            className="flex items-center justify-center py-8 border border-dashed border-nexus-line rounded-[var(--radius-nexus)]"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-nexus-faint">
              没有匹配的选手
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const POS_CHAR: Record<string, string> = {
  TOP: '上',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUPPORT: '辅',
};

function PlayerPoolCard({
  player,
  dragData,
  onPickRequest,
  action,
}: {
  player: RegistrationForPool;
  dragData: Record<string, unknown> | null;
  onPickRequest?: (player: RegistrationForPool) => void;
  action?: React.ReactNode;
}) {
  const draggable = dragData !== null;
  const actionable = draggable && onPickRequest !== undefined;
  const suppressClickRef = useRef(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-player-${player.id}`,
    data: dragData ?? undefined,
    disabled: !draggable,
  });

  useEffect(() => {
    if (isDragging) {
      suppressClickRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [isDragging]);

  const primaryPos = player.primaryPositions[0] as 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT' | undefined;

  return (
    <PlayerHoverCard player={player}>
      <div
        ref={setNodeRef}
        data-testid={`player-pool-card-${player.id}`}
        {...(draggable ? attributes : {})}
        {...(draggable ? listeners : {})}
        onDoubleClick={() => {
          if (suppressClickRef.current) return;
          if (actionable) onPickRequest(player);
        }}
        className={cn(
          'flex h-full min-h-[116px] flex-col justify-between',
          'px-3 py-2.5 border border-nexus-line rounded-[var(--radius-nexus)] transition-colors',
          player.isPicked
            ? 'opacity-40'
            : 'hover:border-nexus-accent/40',
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-40',
        )}
        style={{ background: 'rgb(var(--panel-2))' }}
      >
        {/* Top: name + picked badge + cost */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display text-[13.5px] text-nexus-ink truncate">
                {player.nickname}
              </span>
              {player.isPicked && (
                <Chip variant="default">已选</Chip>
              )}
            </div>
            <span className="block font-mono text-[10px] text-nexus-faint truncate">
              @{player.gameId}
            </span>
          </div>

          {/* Cost badge */}
          <div
            className="shrink-0 border border-nexus-line rounded-[var(--radius-nexus)] px-2 py-1 text-right leading-tight"
            style={{ background: 'rgb(var(--panel))' }}
          >
            <div
              className="font-mono tabular-nums text-[13px] font-semibold"
              style={{ color: 'rgb(var(--accent-n))' }}
            >
              {formatCost(player.cost)}
            </div>
            <div className="font-mono text-[9px] text-nexus-faint">CR</div>
          </div>
        </div>

        {/* Bottom: position pips + drag hint / action */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            {/* Primary position pips */}
            {player.primaryPositions.map((pos) => (
              <PosPip
                key={`p-${pos}`}
                pos={pos as 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'}
                on
                size={24}
              />
            ))}
            {/* Secondary position inline tags */}
            {player.secondaryPositions.map((pos) => (
              <span
                key={`s-${pos}`}
                className="inline-flex h-6 w-6 items-center justify-center font-mono text-[9px] text-nexus-faint border border-nexus-line rounded-[var(--radius-nexus)]"
              >
                {POS_CHAR[pos] ?? pos[0]}
              </span>
            ))}
          </div>
          {actionable && (
            <span
              className="shrink-0 h-6 px-2 font-mono text-[10px] uppercase tracking-[0.1em] border border-nexus-accent/50 text-nexus-accent rounded-[var(--radius-nexus)]"
            >
              拖到空位
            </span>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
    </PlayerHoverCard>
  );
}
