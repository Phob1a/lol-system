'use client';

import { useMemo, useState } from 'react';
import {
  filterPlayers,
  sortPlayers,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type PlayerForPool,
  type PlayerFilter,
  type SortKey,
} from '@/lib/filters';
import type { PositionLiteral } from '@/lib/players/schema';
import { POSITION_OPTIONS } from '@/components/players/positions';
import { TcPos } from '@/components/tactical/TcPos';

type Props = {
  players: PlayerForPool[];
  /** Per-row action area (e.g. "选他" button when on the clock). */
  renderActions?: (player: PlayerForPool) => React.ReactNode;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gameId-asc', label: 'BY ID' },
  { value: 'primary-asc', label: 'BY POS' },
  { value: 'cost-asc', label: 'COST ↑' },
  { value: 'cost-desc', label: 'COST ↓' },
];

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="tc-card" style={{ padding: 12, position: 'relative' }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="search nickname or gameId…"
            value={filter.search ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            className="tc-mono"
            style={{
              background: 'var(--tc-bg-0)',
              color: 'var(--tc-text)',
              border: '1px solid var(--tc-line2)',
              padding: '7px 10px',
              fontSize: 11,
              letterSpacing: 1,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`tc-chip ${sort === opt.value ? 'tc-chip-on' : ''}`}
                style={{ cursor: 'pointer', border: sort === opt.value ? 'none' : '1px solid var(--tc-line2)' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={reset} className="tc-btn" style={{ padding: '4px 12px', fontSize: 10 }}>
            ⟲ RESET
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <span className="tc-label">PRIMARY (OR)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {POSITION_OPTIONS.map((p) => {
                const on = filter.primaryPositions?.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePos('primaryPositions', p.value)}
                    className={`tc-chip ${on ? 'tc-chip-on' : ''}`}
                    style={{ cursor: 'pointer', fontSize: 10, border: on ? 'none' : '1px solid var(--tc-line2)' }}
                  >
                    {p.value}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="tc-label">SECONDARY (OR)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {POSITION_OPTIONS.map((p) => {
                const on = filter.secondaryPositions?.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePos('secondaryPositions', p.value)}
                    className={`tc-chip ${on ? 'tc-chip-on' : ''}`}
                    style={{ cursor: 'pointer', fontSize: 10, border: on ? 'none' : '1px solid var(--tc-line2)' }}
                  >
                    {p.value}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
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
            <span className="tc-label">PICKED</span>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {(['all', 'unpicked', 'picked'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter((f) => ({ ...f, pickedStatus: s }))}
                  className={`tc-chip ${(filter.pickedStatus ?? 'all') === s ? 'tc-chip-on' : ''}`}
                  style={{
                    cursor: 'pointer',
                    fontSize: 10,
                    border: (filter.pickedStatus ?? 'all') === s ? 'none' : '1px solid var(--tc-line2)',
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }} className="tc-mono">
          <span style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            showing {visible.length} of {players.length}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
        {visible.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 6,
              padding: '8px 10px',
              background: p.isPicked ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${p.isPicked ? 'var(--tc-line)' : 'var(--tc-line2)'}`,
              borderLeft: `3px solid ${p.isPicked ? 'var(--tc-line)' : 'var(--tc-purple)'}`,
              opacity: p.isPicked ? 0.5 : 1,
              fontFamily: 'var(--tc-font-mono)',
              fontSize: 11,
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="tc-display" style={{ fontSize: 13, color: 'var(--tc-text)' }}>
                {p.nickname}
                {p.isPicked && (
                  <span
                    className="tc-chip"
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      padding: '1px 6px',
                      background: 'rgba(255,61,92,0.18)',
                      color: 'var(--tc-red)',
                      borderColor: 'var(--tc-red)',
                    }}
                  >
                    PICKED
                  </span>
                )}
              </div>
              <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-cyan)' }}>
                @{p.gameId}
              </div>
              <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                {p.primaryPositions.map((pos) => (
                  <TcPos key={`p-${pos}`} pos={pos} size={16} on />
                ))}
                {p.secondaryPositions.map((pos) => (
                  <TcPos key={`s-${pos}`} pos={pos} size={16} />
                ))}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <div className="tc-num" style={{ fontSize: 16, color: 'var(--tc-amber)' }}>
                {p.cost}
                <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-dim)', marginLeft: 2 }}>
                  CR
                </span>
              </div>
              {renderActions && <div>{renderActions(p)}</div>}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div
            className="tc-mono"
            style={{
              gridColumn: '1 / -1',
              padding: 24,
              textAlign: 'center',
              color: 'var(--tc-text-faint)',
              fontSize: 11,
              border: '1px dashed var(--tc-line2)',
            }}
          >
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
      <span className="tc-label">{label}</span>
      <input
        type="number"
        step="any"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="tc-mono"
        style={{
          width: '100%',
          background: 'var(--tc-bg-0)',
          color: 'var(--tc-text)',
          border: '1px solid var(--tc-line2)',
          padding: '5px 8px',
          fontSize: 11,
          letterSpacing: 1,
          outline: 'none',
          marginTop: 4,
        }}
      />
    </div>
  );
}
