/**
 * HexRadar — 6-axis hexagonal ability chart (LoL-client style).
 * Ported from docs/design/nexus/prototype/cards.jsx.
 *
 * Axis values are 0..1. The 6 axes are rendered at 60° increments
 * starting from the top (−90°).
 */

export interface HexRadarAxis {
  /** Display label (e.g. "击杀", "生存") */
  label: string;
  /** Normalised value in [0, 1] */
  v: number;
}

export interface HexRadarProps {
  vals: HexRadarAxis[];
  /** Overall SVG size in px (default 118) */
  size?: number;
}

export default function HexRadar({ vals, size = 118 }: HexRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.3;

  /** Angle for axis i, degrees starting at −90 (top), 60° per step */
  const ang = (i: number) => (Math.PI / 180) * (-90 + i * 60);

  const pt = (i: number, r: number): [number, number] => [
    cx + Math.cos(ang(i)) * R * r,
    cy + Math.sin(ang(i)) * R * r,
  ];

  const ring = (r: number) =>
    vals.map((_, i) => pt(i, r).join(',')).join(' ');

  const poly = vals
    .map((a, i) => pt(i, Math.max(0.05, Math.min(1, a.v))).join(','))
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
      {vals.map((_, i) => {
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

      {/* value polygon — decorative glow gated on prefers-reduced-motion */}
      <polygon
        points={poly}
        fill="rgb(var(--accent-n) / 0.2)"
        stroke="rgb(var(--accent-n))"
        strokeWidth="1.4"
        strokeLinejoin="round"
        className="motion-safe:[filter:drop-shadow(0_0_5px_rgb(var(--accent-n)/0.5))]"
      />

      {/* vertex dots */}
      {vals.map((a, i) => {
        const [x, y] = pt(i, Math.max(0.05, Math.min(1, a.v)));
        return (
          <circle key={i} cx={x} cy={y} r="2" fill="rgb(var(--accent-n))" />
        );
      })}

      {/* axis labels */}
      {vals.map((a, i) => {
        const [x, y] = pt(i, 1.32);
        return (
          <text
            key={i}
            x={x}
            y={y + 2.5}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="7.5"
            fill="rgb(var(--faint))"
            letterSpacing="0.04em"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
