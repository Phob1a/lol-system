/** ChampHeat — champion usage heat bars with win-rate color coding.
 *  Ported from docs/design/nexus/prototype/pubextra.jsx · ChampHeat.
 *  No chart library. Pure HTML/CSS. */

export interface ChampHeatRow {
  name: string;
  games: number;
  /** Win rate percentage, e.g. 58 (not 0.58). */
  winRate: number;
}

export interface ChampHeatProps {
  rows: ChampHeatRow[];
  /**
   * Optional explicit maximum to scale bars against.
   * Defaults to the max games value within `rows`.
   */
  max?: number;
}

/**
 * ChampHeat renders a vertical list of champion rows. The horizontal bar fill
 * is color-coded by win rate:
 * - ≥55% → good (green)
 * - ≥45% → accent-n (neutral)
 * - <45%  → bad (red)
 * Bars are proportional to `games` scaled against `max`.
 * All numbers use tabular-nums.
 *
 * Note: the prototype referenced a `<ChampAvatar>` inline image beside the
 * name — that sub-component is out of scope for this port; name only is
 * rendered here and the avatar slot can be added by the consuming screen.
 */
export function ChampHeat({ rows, max }: ChampHeatProps) {
  const mx = max ?? Math.max(...rows.map((r) => r.games), 1);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => {
        const barColor =
          r.winRate >= 55
            ? 'rgb(var(--good) / 0.8)'
            : r.winRate >= 45
              ? 'rgb(var(--accent-n) / 0.8)'
              : 'rgb(var(--bad) / 0.7)';

        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* name cell */}
            <span
              style={{
                width: 92,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'rgb(var(--ink))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
            </span>

            {/* heat bar */}
            <div
              style={{
                height: 8,
                background: 'rgb(var(--panel-2))',
                border: '1px solid rgb(var(--line))',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${(r.games / mx) * 100}%`,
                  background: barColor,
                }}
              />
            </div>

            {/* stat label */}
            <span
              style={{
                fontSize: 11,
                color: 'rgb(var(--dim))',
                width: 64,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {r.games} 场 · {r.winRate}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
