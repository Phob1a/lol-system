/** FormDots — recent W/L result pills in a horizontal row.
 *  Ported from docs/design/nexus/prototype/lolcharts.jsx · FormDots.
 *  No chart library. Pure HTML/CSS. */

export interface FormDotsProps {
  /**
   * Array of booleans: `true` = win, `false` = loss.
   * Rendered left-to-right (oldest first is conventional).
   */
  form: boolean[];
  /** Side length of each pill in px (default 14). */
  size?: number;
}

/**
 * FormDots renders a compact row of small square-ish pills for recent
 * match results. Win pills glow green; loss pills are muted red.
 */
export function FormDots({ form, size = 14 }: FormDotsProps) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {form.map((w, i) => (
        <span
          key={i}
          title={w ? 'W' : 'L'}
          style={{
            width: size,
            height: size,
            borderRadius: 3,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: size * 0.62,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            background: w
              ? 'rgb(var(--good) / 0.16)'
              : 'rgb(var(--bad) / 0.14)',
            color: w ? 'rgb(var(--good))' : 'rgb(var(--bad))',
            border: `1px solid ${
              w ? 'rgb(var(--good) / 0.5)' : 'rgb(var(--bad) / 0.45)'
            }`,
            boxShadow: w ? '0 0 7px rgb(var(--good) / 0.3)' : 'none',
          }}
        >
          {w ? 'W' : 'L'}
        </span>
      ))}
    </div>
  );
}
