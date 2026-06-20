'use client';

/**
 * Orrery — tilted concentric orbital chart with labeled body nodes and a
 * glowing core label. Ported from docs/design/nexus/prototype/sig.jsx.
 *
 * Supports up to 8 orbital team-node bodies. Pass onBody(teamId) to make
 * nodes with an `id` navigable.
 *
 * Theme tokens consumed via CSS variables (rgb(var(--...))) — never hardcoded.
 * Decorative glow filters are stripped under prefers-reduced-motion via the
 * scoped <style> block below.
 */

/** One orbital body (team node). */
export interface OrreryBody {
  /** Unique team identifier — passed to onBody when clicked. */
  id?: string;
  /** Short label rendered above the node dot. */
  label: string;
  /**
   * Radial fraction (0–1). Align to one of [0.42, 0.66, 0.9, 1.0] to sit on
   * a ring.
   */
  r: number;
  /** Angle in degrees (0 = right, 90 = bottom). */
  a: number;
  /** Whether the node is active / highlighted. */
  on?: boolean;
}

export interface OrreryProps {
  /** Text rendered in the central glowing core. */
  center: string;
  /** Up to 8 orbital body descriptors. */
  bodies: OrreryBody[];
  /** SVG canvas size in px (viewBox square). Defaults to 380. */
  size?: number;
  /**
   * Override the accent colour. Defaults to `rgb(var(--accent-n))`.
   * Pass a full CSS colour string, e.g. `rgb(var(--gold))`.
   */
  color?: string;
  /** Click handler receiving the body's `id`. Only fired when id is set. */
  onBody?: (teamId: string) => void;
}

const MOTION_STYLES = `
@media (prefers-reduced-motion: reduce) {
  .orrery-glow { filter: none !important; }
}
`;

export function Orrery({
  center,
  bodies,
  size = 380,
  color,
  onBody,
}: OrreryProps) {
  const c = color ?? 'rgb(var(--accent-n))';
  const cx = size / 2;
  const cy = size / 2;
  const rx = size * 0.44;
  const ry = rx * 0.6;
  const rings: readonly number[] = [0.42, 0.66, 0.9, 1.0];

  function pt(rf: number, deg: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    return [cx + rx * rf * Math.cos(a), cy + ry * rf * Math.sin(a)];
  }

  const [x1, y1] = pt(1.0, 200);
  const [x2, y2] = pt(1.0, 320);
  const arc = `M ${x1} ${y1} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;

  return (
    <>
      <style>{MOTION_STYLES}</style>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label={`Orrery — ${center}`}
        role="img"
      >
        {/* Orbital rings */}
        {rings.map((rf, i) => (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={rx * rf}
            ry={ry * rf}
            fill="none"
            stroke="rgb(var(--line))"
            strokeWidth="1"
            strokeDasharray="2 5"
            opacity={0.8}
          />
        ))}

        {/* Accent highlight arc on outer ring */}
        <path
          d={arc}
          fill="none"
          stroke={c}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="orrery-glow"
          style={{ filter: `drop-shadow(0 0 6px ${c})` }}
        />

        {/* Core outer glow circle */}
        <circle
          cx={cx}
          cy={cy}
          r={30}
          fill="rgb(var(--panel-2))"
          stroke={c}
          strokeWidth="1.5"
          className="orrery-glow"
          style={{ filter: `drop-shadow(0 0 16px ${c})` }}
        />
        {/* Core inner ring (no filter — decorative only) */}
        <circle
          cx={cx}
          cy={cy}
          r={30}
          fill="none"
          stroke={c}
          strokeWidth="1"
          opacity={0.4}
        />
        <text
          x={cx}
          y={cy}
          fill={c}
          fontFamily="var(--font-mono)"
          fontSize="12"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="central"
          letterSpacing="1"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {center}
        </text>

        {/* Orbital bodies */}
        {bodies.map((b, i) => {
          const [bx, by] = pt(b.r, b.a);
          const isClickable = !!(onBody && b.id);
          return (
            <g
              key={i}
              onClick={() => isClickable && onBody!(b.id!)}
              style={{ cursor: isClickable ? 'pointer' : 'default' }}
              role={isClickable ? 'button' : undefined}
              aria-label={isClickable ? b.label : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={
                isClickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onBody!(b.id!);
                      }
                    }
                  : undefined
              }
            >
              <circle
                cx={bx}
                cy={by}
                r={b.on ? 6 : 4.5}
                fill={b.on ? c : 'rgb(var(--panel))'}
                stroke={c}
                strokeWidth="1.5"
                className={b.on ? 'orrery-glow' : undefined}
                style={b.on ? { filter: `drop-shadow(0 0 7px ${c})` } : undefined}
              />
              {/* Enlarged hit-target for clickable nodes */}
              {isClickable && (
                <circle cx={bx} cy={by} r={13} fill="transparent" />
              )}
              <text
                x={bx}
                y={by - 13}
                fill={b.on ? c : 'rgb(var(--dim))'}
                fontFamily="var(--font-mono)"
                fontSize="9.5"
                letterSpacing="1.5"
                textAnchor="middle"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
