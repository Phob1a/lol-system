/** TrajectoryLine — timeline with altitude-profile fill and diamond waypoints.
 *  Ported from docs/design/nexus/prototype/sig.jsx · TrajectoryLine.
 *  No chart library. Inline SVG only. */

export interface TrajectoryLineProps {
  /** Numeric y-values for each waypoint. */
  points: number[];
  /** Index of the currently active waypoint (highlighted diamond). */
  current: number;
  /** Optional label strings below each waypoint (parallel to `points`). */
  labels?: string[];
  /** SVG logical width (default 900). */
  w?: number;
  /** SVG logical height (default 90). */
  h?: number;
  /** Line/fill color. Defaults to `rgb(var(--accent-n))`. */
  color?: string;
}

/**
 * TrajectoryLine plots `points` as a polyline with a gradient area fill.
 * Each waypoint is rendered as a rotated diamond (45° square); the current
 * waypoint glows. Numeric labels use tabular-nums.
 */
export function TrajectoryLine({
  points,
  current,
  labels,
  w = 900,
  h = 90,
  color,
}: TrajectoryLineProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const n = points.length;
  if (n < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;

  const px = (i: number) => 8 + (i / (n - 1)) * (w - 16);
  const py = (v: number) => h - 18 - ((v - min) / span) * (h - 34);

  const linePath = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${px(n - 1)} ${h - 6} L ${px(0)} ${h - 6} Z`;

  const gid = `trg-${w}-${h}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.22" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* area fill */}
      <path d={areaPath} fill={`url(#${gid})`} />

      {/* polyline */}
      <path d={linePath} fill="none" stroke={c} strokeWidth="1.5" opacity="0.85" />

      {/* waypoint diamonds */}
      {points.map((v, i) => {
        const isOn = i === current;
        const passed = i < current;
        const cx = px(i);
        const cy = py(v);
        const half = isOn ? 5 : 3.5;

        return (
          <g key={i}>
            <rect
              x={cx - half}
              y={cy - half}
              width={half * 2}
              height={half * 2}
              transform={`rotate(45 ${cx} ${cy})`}
              fill={isOn || passed ? c : 'rgb(var(--panel))'}
              stroke={c}
              strokeWidth="1.3"
              opacity={passed || isOn ? 1 : 0.7}
              style={
                isOn
                  ? { filter: `drop-shadow(0 0 7px ${c})` }
                  : undefined
              }
            />
            {labels && (
              <text
                x={cx}
                y={h - 1}
                fill={isOn ? c : 'rgb(var(--faint))'}
                fontFamily="var(--font-mono)"
                fontSize="8.5"
                textAnchor="middle"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
