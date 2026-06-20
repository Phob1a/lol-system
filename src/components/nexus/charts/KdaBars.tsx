/** KdaBars — horizontal K / D / A triad bars.
 *  Ported from docs/design/nexus/prototype/lolcharts.jsx · KdaBars.
 *  No chart library. Pure HTML/CSS. */

export interface KdaBarsProps {
  k: number;
  d: number;
  a: number;
}

/**
 * KdaBars renders three labeled horizontal bars for Kills, Deaths, and
 * Assists. All bars scale relative to the highest of the three values.
 * Colors: K → accent-n, D → bad, A → accent-n2.
 * All numbers use tabular-nums.
 */
export function KdaBars({ k, d, a }: KdaBarsProps) {
  const max = Math.max(k, d, a, 1);

  const rows: { label: string; val: number; col: string }[] = [
    { label: 'K', val: k, col: 'rgb(var(--accent-n))' },
    { label: 'D', val: d, col: 'rgb(var(--bad))' },
    { label: 'A', val: a, col: 'rgb(var(--accent-n2))' },
  ];

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(({ label, val, col }) => (
        <div
          key={label}
          style={{
            display: 'grid',
            gridTemplateColumns: '16px 1fr 34px',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* label */}
          <span
            style={{
              fontSize: 10,
              color: 'rgb(var(--faint))',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {label}
          </span>

          {/* bar track */}
          <span
            style={{
              height: 7,
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
                width: `${(val / max) * 100}%`,
                background: col,
                boxShadow: `0 0 6px ${col}88`,
              }}
            />
          </span>

          {/* value */}
          <span
            style={{
              fontSize: 12,
              color: 'rgb(var(--ink))',
              textAlign: 'right',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {val}
          </span>
        </div>
      ))}
    </div>
  );
}
