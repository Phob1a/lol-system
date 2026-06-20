/**
 * PlayerRadar — 5-axis performance polygon.
 * Ported from docs/design/nexus/prototype/lolcharts.jsx.
 *
 * Axis values are 0..1 (fractional). Pass label+v per axis.
 * Default axes: KDA / 输出 / 经济 / 补刀 / 胜率 (caller decides).
 */

export interface RadarAxis {
  /** Display label (e.g. "KDA", "输出") */
  label: string;
  /** Normalised value in [0, 1] */
  v: number;
}

export interface PlayerRadarProps {
  axes: RadarAxis[];
  /** Overall SVG size in px (default 200) */
  size?: number;
  /**
   * Stroke/fill colour string.
   * Defaults to the nexus accent token: rgb(var(--accent-n)).
   */
  color?: string;
}

export default function PlayerRadar({
  axes,
  size = 200,
  color,
}: PlayerRadarProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;
  const n = axes.length;

  const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, rf: number): [number, number] => [
    cx + R * rf * Math.cos(ang(i)),
    cy + R * rf * Math.sin(ang(i)),
  ];

  const rings = [0.25, 0.5, 0.75, 1] as const;

  const poly = axes
    .map((a, i) => pt(i, Math.max(0.05, a.v)).join(','))
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* grid rings */}
      {rings.map((rf, i) => (
        <polygon
          key={i}
          points={axes.map((_, k) => pt(k, rf).join(',')).join(' ')}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth="1"
          opacity={0.6}
        />
      ))}

      {/* radial spokes */}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgb(var(--line))"
            strokeWidth="1"
            opacity="0.5"
          />
        );
      })}

      {/* value polygon — decorative glow gated on prefers-reduced-motion via inline style */}
      <polygon
        points={poly}
        fill={c}
        fillOpacity="0.16"
        stroke={c}
        strokeWidth="2"
        className="motion-safe:[filter:drop-shadow(0_0_7px_var(--accent-n))]"
      />

      {/* vertex dots */}
      {axes.map((a, i) => {
        const [x, y] = pt(i, a.v);
        return <circle key={i} cx={x} cy={y} r="2.6" fill={c} />;
      })}

      {/* axis labels */}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.24);
        return (
          <text
            key={i}
            x={x}
            y={y}
            fill="rgb(var(--dim))"
            fontFamily="var(--font-mono)"
            fontSize="9.5"
            letterSpacing="0.5"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
