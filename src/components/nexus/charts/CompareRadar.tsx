/**
 * CompareRadar — dual-overlay N-axis radar (team vs field, or A vs B).
 * Ported from docs/design/nexus/prototype/pubextra.jsx.
 *
 * Both `a` and `b` arrays are values in [0, 1].
 * `b` is optional — omit to show a single polygon.
 */

export interface CompareRadarProps {
  /** Primary series values, 0..1 each */
  a: number[];
  /** Secondary series values, 0..1 each (optional) */
  b?: number[];
  /** Axis label for each position */
  labels: string[];
  /** Overall SVG size in px (default 230) */
  size?: number;
  /**
   * Primary polygon colour.
   * Defaults to nexus accent: rgb(var(--accent-n)).
   */
  aColor?: string;
  /**
   * Secondary polygon colour.
   * Defaults to nexus accent-2: rgb(var(--accent-n2)).
   */
  bColor?: string;
}

export default function CompareRadar({
  a,
  b,
  labels,
  size = 230,
  aColor = 'rgb(var(--accent-n))',
  bColor = 'rgb(var(--accent-n2))',
}: CompareRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.34;
  const n = labels.length;

  const ang = (i: number) => (Math.PI / 180) * (-90 + i * (360 / n));

  const pt = (i: number, r: number): [number, number] => [
    cx + Math.cos(ang(i)) * R * r,
    cy + Math.sin(ang(i)) * R * r,
  ];

  const ring = (r: number) =>
    labels.map((_, i) => pt(i, r).join(',')).join(' ');

  const poly = (vals: number[]) =>
    vals
      .map((v, i) => pt(i, Math.max(0.05, Math.min(1, v))).join(','))
      .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* grid rings */}
      {([0.25, 0.5, 0.75, 1] as const).map((r, i) => (
        <polygon
          key={i}
          points={ring(r)}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="0.7"
        />
      ))}

      {/* radial spokes */}
      {labels.map((_, i) => {
        const [x, y] = pt(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgb(var(--line) / 0.6)"
            strokeWidth="0.6"
          />
        );
      })}

      {/* secondary polygon (b) — drawn first so primary sits above */}
      {b && (
        <polygon
          points={poly(b)}
          fill={bColor}
          stroke={bColor}
          strokeWidth="1.4"
          strokeLinejoin="round"
          fillOpacity="0.12"
        />
      )}

      {/* primary polygon (a) — decorative glow gated on prefers-reduced-motion */}
      <polygon
        points={poly(a)}
        fill={aColor}
        stroke={aColor}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fillOpacity="0.2"
        className="motion-safe:[filter:drop-shadow(0_0_5px_rgb(var(--accent-n)/0.5))]"
      />

      {/* axis labels */}
      {labels.map((l, i) => {
        const [x, y] = pt(i, 1.3);
        return (
          <text
            key={i}
            x={x}
            y={y + 2.5}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            fill="rgb(var(--faint))"
          >
            {l}
          </text>
        );
      })}
    </svg>
  );
}
