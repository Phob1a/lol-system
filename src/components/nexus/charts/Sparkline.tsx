/** Sparkline — thin polyline sparkline with optional terminal dot.
 *  Ported from docs/design/nexus/prototype/sig.jsx · Sparkline.
 *  No chart library. Inline SVG only. */

export interface SparklineProps {
  /** Numeric data series (at least 2 points). */
  data: number[];
  /** SVG logical width in px (default 90). */
  w?: number;
  /** SVG logical height in px (default 26). */
  h?: number;
  /** Stroke color — any valid CSS color string.
   *  Defaults to `rgb(var(--dim))`. */
  color?: string;
  /** Whether to draw a filled circle at the last data point. */
  dot?: boolean;
}

/**
 * Sparkline draws a minimal polyline over `data`, sized to w×h px.
 * Suitable for inline use inside table cells or stat tiles.
 */
export function Sparkline({ data, w = 90, h = 26, color, dot }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const c = color ?? 'rgb(var(--dim))';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;

  const px = (i: number) => (i / (data.length - 1)) * w;
  const py = (v: number) => h - 3 - ((v - min) / span) * (h - 6);

  const line = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`)
    .join(' ');

  const lastX = px(data.length - 1);
  const lastY = py(data[data.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path
        d={line}
        fill="none"
        stroke={c}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {dot && (
        <circle cx={lastX} cy={lastY} r="2" fill={c} />
      )}
    </svg>
  );
}
