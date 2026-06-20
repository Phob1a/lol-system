/** SeasonTrend — cumulative win/loss trend line over a season.
 *  Ported from docs/design/nexus/prototype/pubextra.jsx · SeasonTrend.
 *  No chart library. Inline SVG only. */

export interface SeasonTrendGame {
  /** Whether this game was a win. */
  win: boolean;
}

export interface SeasonTrendProps {
  /** Ordered list of game results (earliest first). */
  games: SeasonTrendGame[];
  /** SVG logical width (default 320). */
  w?: number;
  /** SVG rendered height in px (default 70). */
  h?: number;
}

/**
 * SeasonTrend accumulates wins (+1) and losses (−1) into a running
 * cumulative score and plots it as a polyline. A dashed zero-line sits at
 * the neutral baseline. Each point is a small dot colored green (win) or
 * red (loss). The polyline uses a drop-shadow glow in accent-n.
 *
 * SVG uses `preserveAspectRatio="none"` for fluid width rendering (matches
 * the prototype).
 */
export function SeasonTrend({ games, w = 320, h = 70 }: SeasonTrendProps) {
  if (!games || games.length === 0) return null;

  // Cumulative W-L running total
  let cum = 0;
  const pts = games.map((g) => {
    cum += g.win ? 1 : -1;
    return cum;
  });

  const min = Math.min(0, ...pts);
  const max = Math.max(1, ...pts);
  const span = max - min || 1;
  const n = pts.length;

  const X = (i: number) => 6 + (i / (n - 1 || 1)) * (w - 12);
  const Y = (v: number) => h - 8 - ((v - min) / span) * (h - 16);

  const d = pts
    .map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1))
    .join(' ');

  const zeroY = Y(0);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height: h }}
      aria-hidden="true"
    >
      {/* zero baseline */}
      <line
        x1="6"
        y1={zeroY}
        x2={w - 6}
        y2={zeroY}
        stroke="rgb(var(--line))"
        strokeWidth="0.8"
        strokeDasharray="3 3"
      />

      {/* trend polyline with glow */}
      <path
        d={d}
        fill="none"
        stroke="rgb(var(--accent-n))"
        strokeWidth="2"
        style={{ filter: 'drop-shadow(0 0 4px rgb(var(--accent-n) / 0.5))' }}
      />

      {/* per-game dots colored by result */}
      {pts.map((v, i) => (
        <circle
          key={i}
          cx={X(i)}
          cy={Y(v)}
          r="2.4"
          fill={games[i].win ? 'rgb(var(--good))' : 'rgb(var(--bad))'}
        />
      ))}
    </svg>
  );
}
