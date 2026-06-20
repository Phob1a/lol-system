/** GroupBars — group standings as horizontal point bars.
 *  Ported from docs/design/nexus/prototype/lolcharts.jsx · GroupBars.
 *  No chart library. Pure HTML/CSS. */

export interface GroupBarsRow {
  rank: number;
  name: string;
  points: number;
  wins: number;
  losses: number;
}

export interface GroupBarsProps {
  rows: GroupBarsRow[];
  /** Bar fill color for top-2 rows. Defaults to `rgb(var(--accent-n))`. */
  color?: string;
}

/**
 * GroupBars renders standings as a grid of horizontal bars scaled to the
 * maximum points in the set. The top 2 rows are highlighted in `color`;
 * lower-ranked rows use `rgb(var(--dim))`. Win/loss record appears at right.
 * All numeric values use tabular-nums.
 */
export function GroupBars({ rows, color }: GroupBarsProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const max = Math.max(...rows.map((r) => r.points), 3);

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r, i) => {
        const isTop = i < 2;
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 96px 1fr auto',
              alignItems: 'center',
              gap: 9,
            }}
          >
            {/* rank */}
            <span
              style={{
                fontSize: 12,
                color: isTop ? c : 'rgb(var(--faint))',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.rank}
            </span>

            {/* team name */}
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12.5,
                color: 'rgb(var(--ink))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.name}
            </span>

            {/* bar track */}
            <span
              style={{
                height: 8,
                background: 'rgb(var(--line))',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'block',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(r.points / max) * 100}%`,
                  background: isTop ? c : 'rgb(var(--dim))',
                  boxShadow: isTop ? `0 0 7px ${c}88` : 'none',
                }}
              />
            </span>

            {/* W-L record */}
            <span
              style={{
                fontSize: 11,
                color: 'rgb(var(--dim))',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {r.wins}-{r.losses}
            </span>
          </div>
        );
      })}
    </div>
  );
}
