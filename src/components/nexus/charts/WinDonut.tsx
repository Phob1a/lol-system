/**
 * WinDonut — win-rate ring with centred readout.
 * Ported from docs/design/nexus/prototype/lolcharts.jsx.
 *
 * `pct` is 0..100 (percentage, same as the source).
 */

export interface WinDonutProps {
  /** Win-rate percentage, 0..100 */
  pct: number;
  /** Overall diameter in px (default 92) */
  size?: number;
  /**
   * Ring fill colour.
   * Defaults to nexus accent token: rgb(var(--accent-n)).
   */
  color?: string;
}

export default function WinDonut({ pct, size = 92, color }: WinDonutProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const r = (size - 12) / 2;
  const cir = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, pct / 100));

  return (
    <div
      style={{ position: 'relative', width: size, height: size }}
      role="img"
      aria-label={`胜率 ${pct}%`}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="6"
        />
        {/* fill arc — decorative glow gated on prefers-reduced-motion */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${cir * v} ${cir}`}
          className="motion-safe:[filter:drop-shadow(0_0_5px_rgb(var(--accent-n)))]"
        />
      </svg>

      {/* centred label */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
        aria-hidden="true"
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: size * 0.27,
              color: 'rgb(var(--ink))',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pct}
            <span style={{ fontSize: size * 0.14 }}>%</span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.12em',
              color: 'rgb(var(--faint))',
              marginTop: 2,
            }}
          >
            WIN
          </div>
        </div>
      </div>
    </div>
  );
}
