/** SegBudget — segmented progress bar (budget/capacity gauge).
 *  Ported from docs/design/nexus/prototype/sig.jsx · SegBudget.
 *  No chart library. Pure CSS/HTML segments. */

export interface SegBudgetProps {
  /** Amount used. */
  used: number;
  /** Total amount (max). */
  total: number;
  /** Number of segments to divide the bar into (default 24). */
  segs?: number;
  /** Active segment fill color. Defaults to `rgb(var(--accent-n))`. */
  color?: string;
}

/**
 * SegBudget renders a row of fixed-count segments where the first `lit`
 * segments are filled in `color` (with a soft glow) and the rest are dim.
 */
export function SegBudget({ used, total, segs = 24, color }: SegBudgetProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const frac = Math.max(0, Math.min(1, used / total));
  const lit = Math.round(frac * segs);

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 8,
            background: i < lit ? c : 'rgb(var(--line))',
            boxShadow: i < lit ? `0 0 6px ${c}88` : 'none',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
