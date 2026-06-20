/* Signature SVG devices for the ops dashboard. Pure shapes, themed via CSS vars.
   Orrery (celestial) · HexMap (command) · MoonPhase · AltitudeArc · TrajectoryLine ·
   Sparkline · RingDial · SegBudget. */

const A = () => 'rgb(var(--accent))';
const A2 = () => 'rgb(var(--accent-2))';
const LN = () => 'rgb(var(--line))';
const DM = () => 'rgb(var(--dim))';
const FT = () => 'rgb(var(--faint))';

/* ---- Orrery: tilted concentric orbits + labeled body dots + glowing core ---- */
function Orrery({ center, bodies, size = 380, color, onBody }) {
  const c = color || A();
  const cx = size / 2, cy = size / 2;
  const rx = size * 0.44, ry = rx * 0.6;
  const rings = [0.42, 0.66, 0.9, 1.0];
  const pt = (rf, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + rx * rf * Math.cos(a), cy + ry * rf * Math.sin(a)];
  };
  // highlight arc on outer ring
  const arc = (() => {
    const [x1, y1] = pt(1.0, 200), [x2, y2] = pt(1.0, 320);
    return `M ${x1} ${y1} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;
  })();
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {rings.map((rf, i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx * rf} ry={ry * rf} fill="none"
          stroke={LN()} strokeWidth="1" strokeDasharray="2 5" opacity={0.8} />
      ))}
      <path d={arc} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px ' + c + ')' }} />
      {/* core */}
      <circle cx={cx} cy={cy} r="30" fill="rgb(var(--panel-2))" stroke={c} strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 16px ' + c + ')' }} />
      <circle cx={cx} cy={cy} r="30" fill="none" stroke={c} strokeWidth="1" opacity="0.4" />
      <text x={cx} y={cy} fill={c} fontFamily="var(--font-mono)" fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="central" letterSpacing="1">{center}</text>
      {/* bodies */}
      {bodies.map((b, i) => {
        const [x, y] = pt(b.r, b.a);
        const on = b.on;
        return (
          <g key={i} onClick={() => onBody && b.id && onBody(b.id)} style={{ cursor: onBody && b.id ? 'pointer' : 'default' }}>
            <circle cx={x} cy={y} r={on ? 6 : 4.5} fill={on ? c : 'rgb(var(--panel))'} stroke={c} strokeWidth="1.5"
              style={on ? { filter: 'drop-shadow(0 0 7px ' + c + ')' } : {}} />
            {onBody && b.id && <circle cx={x} cy={y} r="13" fill="transparent" />}
            <text x={x} y={y - 13} fill={on ? c : DM()} fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.5" textAnchor="middle">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- HexMap: hexagon nodes + dependency links ---- */
function hexPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1) + ' ';
  }
  return d + 'Z';
}
function HexMap({ nodes, links, w = 560, h = 230, color }) {
  const c = color || A();
  const px = (x) => 24 + x * (w - 48);
  const py = (y) => 22 + y * (h - 44);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      {links.map((l, i) => {
        const a = byId[l[0]], b = byId[l[1]];
        if (!a || !b) return null;
        const strong = a.on || b.on;
        return <line key={i} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} stroke={strong ? c : LN()} strokeWidth="1" strokeDasharray={strong ? '0' : '3 4'} opacity={strong ? 0.85 : 0.6} />;
      })}
      {nodes.map((n, i) => {
        const x = px(n.x), y = py(n.y); const on = n.on;
        return (
          <g key={i}>
            <path d={hexPath(x, y, 17)} fill={on ? 'rgb(var(--accent) / 0.16)' : 'rgb(var(--panel-2))'} stroke={on ? c : LN()} strokeWidth={on ? 1.6 : 1}
              style={on ? { filter: 'drop-shadow(0 0 8px ' + c + ')' } : {}} />
            <text x={x} y={y} fill={on ? c : DM()} fontFamily="var(--font-mono)" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="central">{n.id}</text>
            <text x={x} y={y + 28} fill={on ? c : FT()} fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" textAnchor="middle">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- MoonPhase row: almanac progress ---- */
function MoonPhase({ total, current, size = 16 }) {
  const items = [];
  for (let i = 0; i < total; i++) {
    const done = i < current, now = i === current;
    const frac = total <= 1 ? 1 : i / (total - 1);
    items.push(
      <span key={i} style={{ position: 'relative', width: size, height: size, display: 'inline-block' }} title={'Night ' + (i + 1)}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid ' + (now ? A() : LN()), background: done ? 'rgb(var(--accent) / 0.85)' : 'transparent', boxShadow: now ? '0 0 8px ' + A() : 'none' }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: (frac * 100) + '%', background: done || now ? 'rgb(var(--accent) / 0.5)' : 'rgb(var(--ink) / 0.08)' }} />
        </span>
      </span>
    );
  }
  return <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{items}</div>;
}

/* ---- AltitudeArc: tonight window curve with marker ---- */
function AltitudeArc({ w = 320, h = 92, markerFrac = 0.5, labels = ['21h', '22h', '23h', '24h'], color }) {
  const c = color || A();
  const pad = 4;
  const curve = `M ${pad} ${h - 16} Q ${w / 2} ${-4} ${w - pad} ${h - 16}`;
  const mx = pad + markerFrac * (w - pad * 2);
  // y on quadratic at markerFrac
  const t = markerFrac, y0 = h - 16, y1 = -4;
  const my = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y0;
  const gid = 'altg' + Math.round(w + h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.28" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={`${curve} L ${w - pad} ${h - 16} L ${pad} ${h - 16} Z`} fill={`url(#${gid})`} />
      <path d={curve} fill="none" stroke={c} strokeWidth="2" style={{ filter: 'drop-shadow(0 0 5px ' + c + ')' }} />
      <line x1={mx} y1={my} x2={mx} y2={h - 16} stroke={c} strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={mx} cy={my} r="3.5" fill={c} style={{ filter: 'drop-shadow(0 0 6px ' + c + ')' }} />
      <line x1={pad} y1={h - 16} x2={w - pad} y2={h - 16} stroke={LN()} strokeWidth="1" />
      {labels.map((l, i) => (
        <text key={i} x={pad + (i / (labels.length - 1)) * (w - pad * 2)} y={h - 3} fill={FT()} fontFamily="var(--font-mono)" fontSize="9" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text>
      ))}
    </svg>
  );
}

/* ---- TrajectoryLine: timeline waypoints with altitude profile ---- */
function TrajectoryLine({ points, current, labels, w = 900, h = 90, color }) {
  const c = color || A();
  const n = points.length;
  const max = Math.max(...points), min = Math.min(...points), span = max - min || 1;
  const px = (i) => 8 + (i / (n - 1)) * (w - 16);
  const py = (v) => h - 18 - ((v - min) / span) * (h - 34);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const gid = 'trg' + Math.round(w + h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.22" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L ${px(n - 1)} ${h - 6} L ${px(0)} ${h - 6} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="1.5" opacity="0.85" />
      {points.map((v, i) => {
        const on = i === current, passed = i < current;
        return (
          <g key={i}>
            <rect x={px(i) - (on ? 5 : 3.5)} y={py(v) - (on ? 5 : 3.5)} width={on ? 10 : 7} height={on ? 10 : 7} transform={`rotate(45 ${px(i)} ${py(v)})`}
              fill={on ? c : passed ? c : 'rgb(var(--panel))'} stroke={c} strokeWidth="1.3" style={on ? { filter: 'drop-shadow(0 0 7px ' + c + ')' } : {}} opacity={passed || on ? 1 : 0.7} />
            {labels && <text x={px(i)} y={h - 1} fill={on ? c : FT()} fontFamily="var(--font-mono)" fontSize="8.5" textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ---- Sparkline ---- */
function Sparkline({ data, w = 90, h = 26, color, dot }) {
  if (!data || !data.length) return null;
  const c = color || DM();
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const px = (i) => (i / (data.length - 1)) * w;
  const py = (v) => h - 3 - ((v - min) / span) * (h - 6);
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <path d={line} fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      {dot && <circle cx={px(data.length - 1)} cy={py(data[data.length - 1])} r="2" fill={c} />}
    </svg>
  );
}

/* ---- RingDial: arc gauge ---- */
function RingDial({ value, max = 10, size = 54, color, label }) {
  const c = color || A();
  const r = (size - 8) / 2, cir = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value / max));
  const sweep = 0.75; // 270deg gauge
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LN()} strokeWidth="4" strokeDasharray={`${cir * sweep} ${cir}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth="4" strokeDasharray={`${cir * sweep * v} ${cir}`} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px ' + c + ')' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <span className="readout" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.3, color: 'rgb(var(--ink))' }}>{label != null ? label : value}</span>
      </div>
    </div>
  );
}

/* ---- SegBudget: segmented progress bar ---- */
function SegBudget({ used, total, segs = 24, color }) {
  const c = color || A();
  const frac = Math.max(0, Math.min(1, used / total));
  const lit = Math.round(frac * segs);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <span key={i} style={{ flex: 1, height: 8, background: i < lit ? c : 'rgb(var(--line))', boxShadow: i < lit ? '0 0 6px ' + c + '88' : 'none', borderRadius: 1 }} />
      ))}
    </div>
  );
}

Object.assign(window, { Orrery, HexMap, MoonPhase, AltitudeArc, TrajectoryLine, Sparkline, RingDial, SegBudget });
