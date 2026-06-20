/**
 * MetaDonut — position meta distribution as a segmented donut chart
 * with an inline legend.
 * Ported from docs/design/nexus/prototype/pubextra.jsx.
 *
 * `data[i].v` is a raw count (not a fraction); total is derived internally.
 * Segment colours cycle through the five nexus accent/semantic tokens.
 */

export interface MetaDonutSlice {
  /** Display label (e.g. "上路", "打野") */
  label: string;
  /** Raw count value (any non-negative number) */
  v: number;
}

export interface MetaDonutProps {
  data: MetaDonutSlice[];
  /** Overall SVG diameter in px (default 150) */
  size?: number;
}

/**
 * Five-slot colour cycle matching the prototype:
 * accent · accent-2 · gold · good · accent-2 (fallback wraps)
 */
const SEGMENT_COLORS = [
  'rgb(var(--accent-n))',
  'rgb(var(--accent-n2))',
  'rgb(var(--gold))',
  'rgb(var(--good))',
  'rgb(var(--accent-n2))',
] as const;

export default function MetaDonut({ data, size = 150 }: MetaDonutProps) {
  const total = data.reduce((a, d) => a + d.v, 0) || 1;
  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const cir = 2 * Math.PI * r;
  const strokeWidth = size * 0.13;

  // Accumulate dash-offset as a fraction of circumference
  let acc = 0;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 16 }}
      role="img"
      aria-label="位置分布"
    >
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
        aria-hidden="true"
      >
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgb(var(--panel-2))"
          strokeWidth={strokeWidth}
        />
        {/* segments */}
        {data.map((d, i) => {
          const frac = d.v / total;
          const dash = frac * cir;
          // strokeDashoffset is negative to advance the start of the arc
          const offset = -(acc * cir);
          acc += frac;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${cir - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>

      {/* legend */}
      <div style={{ display: 'grid', gap: 6 }} aria-label="图例">
        {data.map((d, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                display: 'inline-block',
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgb(var(--dim))',
                letterSpacing: '0.04em',
              }}
            >
              {d.label}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgb(var(--ink))',
                marginLeft: 'auto',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {d.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
