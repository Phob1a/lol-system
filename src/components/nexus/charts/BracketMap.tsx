'use client';

/**
 * BracketMap — group → knockout flow as a celestial node-graph.
 * Ported from docs/design/nexus/prototype/lolcharts.jsx.
 *
 * Layout: Group A (left column) → Semifinals (centre) → Group B (right column)
 * with a Finals node at the bottom centre. Connector lines drawn as SVG paths.
 *
 * Theme tokens consumed via CSS variables — never hardcoded hex.
 * Decorative drop-shadow filters gated behind
 *   @media (prefers-reduced-motion: no-preference).
 */

export interface BracketRow {
  /** Team name. */
  name: string;
  /** Numeric standing points. */
  points: number;
}

export interface BracketStanding {
  /** Ordered list of teams for this group (top to bottom = rank 1…N). */
  rows: BracketRow[];
}

export interface BracketMapProps {
  /**
   * Exactly two standings: index 0 = Group A (left), index 1 = Group B (right).
   * Only the top 4 rows from each group are rendered.
   */
  standings: [BracketStanding, BracketStanding];
  /** SVG canvas width. Defaults to 540. */
  w?: number;
  /** SVG canvas height. Defaults to 280. */
  h?: number;
  /**
   * Override the accent colour. Defaults to `rgb(var(--accent-n))`.
   * Pass a full CSS colour string, e.g. `rgb(var(--gold))`.
   */
  color?: string;
}

const MOTION_STYLES = `
@media (prefers-reduced-motion: reduce) {
  .bracket-glow { filter: none !important; }
}
`;

export function BracketMap({
  standings,
  w = 540,
  h = 280,
  color,
}: BracketMapProps) {
  const c = color ?? 'rgb(var(--accent-n))';

  /** Column x-fractions: left group / centre SFs / right group */
  const colX = [0.10, 0.46, 0.82] as const;

  const A = standings[0]?.rows ?? [];
  const B = standings[1]?.rows ?? [];

  /** Map a [0,1] x-fraction to SVG canvas pixels (with 16px padding each side). */
  const mapX = (f: number) => 16 + f * (w - 32);

  function renderNode(
    x: number,
    y: number,
    label: string,
    sub: string,
    lit: boolean,
    key: string,
  ) {
    return (
      <g key={key}>
        <rect
          x={x - 58}
          y={y - 15}
          width={116}
          height={30}
          rx="3"
          fill={lit ? 'rgb(var(--accent-n) / 0.12)' : 'rgb(var(--panel-2))'}
          stroke={lit ? c : 'rgb(var(--line))'}
          strokeWidth={lit ? 1.5 : 1}
          className={lit ? 'bracket-glow' : undefined}
          style={lit ? { filter: `drop-shadow(0 0 8px ${c})` } : undefined}
        />
        <text
          x={x - 50}
          y={y}
          fill={lit ? c : 'rgb(var(--ink))'}
          fontFamily="var(--font-body)"
          fontSize="11.5"
          dominantBaseline="central"
        >
          {label}
        </text>
        <text
          x={x + 50}
          y={y}
          fill="rgb(var(--faint))"
          fontFamily="var(--font-mono)"
          fontSize="9"
          textAnchor="end"
          dominantBaseline="central"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {sub}
        </text>
      </g>
    );
  }

  /** Y-position for the i-th row in a group column. */
  const yRow = (i: number) => 44 + i * 40;

  return (
    <>
      <style>{MOTION_STYLES}</style>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        style={{ display: 'block' }}
        aria-label="Tournament bracket"
        role="img"
      >
        {/* Column headers */}
        <text
          x={mapX(colX[0])}
          y="22"
          fill="rgb(var(--faint))"
          fontFamily="var(--font-mono)"
          fontSize="9"
          letterSpacing="2"
          textAnchor="middle"
        >
          A 组
        </text>
        <text
          x={mapX(colX[2])}
          y="22"
          fill="rgb(var(--faint))"
          fontFamily="var(--font-mono)"
          fontSize="9"
          letterSpacing="2"
          textAnchor="middle"
        >
          B 组
        </text>

        {/* Group A column — top 4 rows */}
        {A.slice(0, 4).map((r, i) =>
          renderNode(
            mapX(colX[0]),
            yRow(i),
            r.name,
            `${r.points} PT`,
            i < 2,
            `a${i}`,
          ),
        )}

        {/* Semifinals (centre column) */}
        {renderNode(mapX(colX[1]), 84, 'SF · 半决赛 1', 'BO3', false, 'sf1')}
        {renderNode(mapX(colX[1]), 164, 'SF · 半决赛 2', 'BO3', false, 'sf2')}

        {/* Group B column — top 4 rows */}
        {B.slice(0, 4).map((r, i) =>
          renderNode(
            mapX(colX[2]),
            yRow(i),
            r.name,
            `${r.points} PT`,
            i < 2,
            `b${i}`,
          ),
        )}

        {/* Finals node */}
        {renderNode(mapX(0.46), 244, '★ 总决赛 · BO5', '待定', true, 'final')}

        {/* Connectors: Group A top-2 → SF1 / SF2 */}
        {[0, 1].map((i) => (
          <line
            key={`la${i}`}
            x1={mapX(colX[0]) + 58}
            y1={yRow(i)}
            x2={mapX(colX[1]) - 58}
            y2={i === 0 ? 84 : 164}
            stroke={c}
            strokeWidth="1"
            opacity="0.5"
            strokeDasharray="3 3"
          />
        ))}

        {/* Connectors: Group B top-2 → SF2 / SF1 (cross-linked) */}
        {[0, 1].map((i) => (
          <line
            key={`lb${i}`}
            x1={mapX(colX[2]) - 58}
            y1={yRow(i)}
            x2={mapX(colX[1]) + 58}
            y2={i === 0 ? 164 : 84}
            stroke={c}
            strokeWidth="1"
            opacity="0.5"
            strokeDasharray="3 3"
          />
        ))}

        {/* Connectors: SF1 / SF2 → Final */}
        <line
          x1={mapX(colX[1])}
          y1={99}
          x2={mapX(0.46)}
          y2={229}
          stroke={c}
          strokeWidth="1"
          opacity="0.4"
          strokeDasharray="3 3"
        />
        <line
          x1={mapX(colX[1])}
          y1={179}
          x2={mapX(0.46)}
          y2={229}
          stroke={c}
          strokeWidth="1"
          opacity="0.4"
          strokeDasharray="3 3"
        />
      </svg>
    </>
  );
}
