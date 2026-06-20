/* NEXUS — LoL-specific data-viz, themed via CSS vars. Builds on the sig.jsx device set.
   PlayerRadar · FormDots · KdaBars · WinDonut · ChampBars · BracketMap · PosPip · GroupBars */

const _A = () => 'rgb(var(--accent))';
const _A2 = () => 'rgb(var(--accent-2))';
const _LN = () => 'rgb(var(--line))';
const _DM = () => 'rgb(var(--dim))';
const _FT = () => 'rgb(var(--faint))';
const _GD = () => 'rgb(var(--good))';

/* ---- PlayerRadar: 5-axis performance polygon (KDA / 输出 / 经济 / 补刀 / 胜率) ---- */
function PlayerRadar({ axes, size = 200, color }) {
  const c = color || _A();
  const cx = size / 2, cy = size / 2, R = size * 0.36;
  const n = axes.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, rf) => [cx + R * rf * Math.cos(ang(i)), cy + R * rf * Math.sin(ang(i))];
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = axes.map((a, i) => pt(i, Math.max(0.05, a.v)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {rings.map((rf, i) => (
        <polygon key={i} points={axes.map((_, k) => pt(k, rf).join(',')).join(' ')}
          fill="none" stroke={_LN()} strokeWidth="1" opacity={0.6} />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={_LN()} strokeWidth="1" opacity="0.5" />; })}
      <polygon points={poly} fill={c} fillOpacity="0.16" stroke={c} strokeWidth="2" style={{ filter: 'drop-shadow(0 0 7px ' + c + ')' }} />
      {axes.map((a, i) => { const [x, y] = pt(i, a.v); return <circle key={i} cx={x} cy={y} r="2.6" fill={c} />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.24);
        return <text key={i} x={x} y={y} fill={_DM()} fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.5" textAnchor="middle" dominantBaseline="central">{a.label}</text>;
      })}
    </svg>
  );
}

/* ---- FormDots: recent W/L pills ---- */
function FormDots({ form, size = 14 }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {form.map((w, i) => (
        <span key={i} title={w ? '胜' : '负'} style={{
          width: size, height: size, borderRadius: 3, flex: 'none',
          display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: size * 0.62, fontWeight: 700,
          background: w ? 'rgb(var(--good) / 0.16)' : 'rgb(var(--bad) / 0.14)',
          color: w ? _GD() : 'rgb(var(--bad))',
          border: '1px solid ' + (w ? 'rgb(var(--good) / 0.5)' : 'rgb(var(--bad) / 0.45)'),
          boxShadow: w ? '0 0 7px rgb(var(--good) / 0.3)' : 'none',
        }}>{w ? 'W' : 'L'}</span>
      ))}
    </div>
  );
}

/* ---- KdaBars: horizontal K / D / A triad ---- */
function KdaBars({ k, d, a }) {
  const max = Math.max(k, d, a, 1);
  const row = (label, val, col) => (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 34px', alignItems: 'center', gap: 8 }}>
      <span className="readout" style={{ fontSize: 10, color: _FT() }}>{label}</span>
      <span style={{ height: 7, background: 'rgb(var(--line))', borderRadius: 2, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: (val / max * 100) + '%', background: col, boxShadow: '0 0 6px ' + col + '88' }} />
      </span>
      <span className="readout" style={{ fontSize: 12, color: 'rgb(var(--ink))', textAlign: 'right' }}>{val}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {row('K', k, _A())}
      {row('D', d, 'rgb(var(--bad))')}
      {row('A', a, _A2())}
    </div>
  );
}

/* ---- WinDonut: win-rate ring ---- */
function WinDonut({ pct, size = 92, color }) {
  const c = color || _A();
  const r = (size - 12) / 2, cir = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct / 100));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={_LN()} strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${cir * v} ${cir}`} style={{ filter: 'drop-shadow(0 0 5px ' + c + ')' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="readout" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.27, color: 'rgb(var(--ink))', lineHeight: 1 }}>{pct}<span style={{ fontSize: size * 0.14 }}>%</span></div>
          <div className="kicker" style={{ fontSize: 8, marginTop: 2 }}>WIN</div>
        </div>
      </div>
    </div>
  );
}

/* ---- ChampBars: most-played champions with win-rate fill ---- */
function ChampBars({ champs }) {
  const maxG = Math.max(...champs.map(c => c.games), 1);
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {champs.map((ch, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))' }}>{ch.championName}</span>
              <span className="readout" style={{ fontSize: 11, color: ch.winRate >= 50 ? _GD() : _DM() }}>{ch.winRate}%</span>
            </div>
            <span style={{ display: 'block', height: 5, background: 'rgb(var(--line))', borderRadius: 2, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: (ch.games / maxG * 100) + '%', background: _A(), boxShadow: '0 0 6px rgb(var(--accent) / 0.5)' }} />
            </span>
          </div>
          <span className="readout" style={{ fontSize: 11, color: _FT(), whiteSpace: 'nowrap' }}>{ch.games} G · {ch.kda} KDA</span>
        </div>
      ))}
    </div>
  );
}

/* ---- PosPip: position glyph ---- */
function PosPip({ pos, on, size = 24 }) {
  const POS_CHAR = (window.LOL_DATA && window.LOL_DATA.POS_CHAR) || {};
  return (
    <span style={{
      width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center',
      fontFamily: 'var(--font-display)', fontSize: size * 0.5, fontWeight: 700,
      border: '1px solid ' + (on ? _A() : _LN()), color: on ? _A() : _DM(),
      background: on ? 'rgb(var(--accent) / 0.14)' : 'transparent', borderRadius: 4,
      boxShadow: on ? '0 0 9px rgb(var(--accent) / 0.4)' : 'none',
    }}>{POS_CHAR[pos] || pos[0]}</span>
  );
}

/* ---- BracketMap: group→knockout flow as celestial node-graph ---- */
function BracketMap({ standings, w = 540, h = 280, color }) {
  const c = color || _A();
  const colX = [0.10, 0.46, 0.82];
  const A = standings[0] ? standings[0].rows : [];
  const B = standings[1] ? standings[1].rows : [];
  const px = (f) => 16 + f * (w - 32);
  const node = (x, y, label, sub, lit, key) => (
    <g key={key}>
      <rect x={x - 58} y={y - 15} width={116} height={30} rx="3"
        fill={lit ? 'rgb(var(--accent) / 0.12)' : 'rgb(var(--panel-2))'} stroke={lit ? c : _LN()} strokeWidth={lit ? 1.5 : 1}
        style={lit ? { filter: 'drop-shadow(0 0 8px ' + c + ')' } : {}} />
      <text x={x - 50} y={y} fill={lit ? c : 'rgb(var(--ink))'} fontFamily="var(--font-body)" fontSize="11.5" dominantBaseline="central">{label}</text>
      <text x={x + 50} y={y} fill={_FT()} fontFamily="var(--font-mono)" fontSize="9" textAnchor="end" dominantBaseline="central">{sub}</text>
    </g>
  );
  const yA = (i) => 44 + i * 40;
  const yB = (i) => 44 + i * 40;
  const links = [];
  // group A top2 -> SF, group B top2 -> SF
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <text x={px(colX[0])} y="22" fill={_FT()} fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" textAnchor="middle">A 组</text>
      <text x={px(colX[0]) + (px(colX[2]) - px(colX[0]))} y="22" fill={_FT()} fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" textAnchor="middle"></text>
      {/* group A column */}
      {A.slice(0, 4).map((r, i) => node(px(colX[0]), yA(i), r.name, r.points + ' PT', i < 2, 'a' + i))}
      {/* semifinals (middle) */}
      {node(px(colX[1]), 84, 'SF · 半决赛 1', 'BO3', false, 'sf1')}
      {node(px(colX[1]), 164, 'SF · 半决赛 2', 'BO3', false, 'sf2')}
      {/* group B column (right, mirrored) */}
      <text x={px(colX[2])} y="22" fill={_FT()} fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" textAnchor="middle">B 组</text>
      {B.slice(0, 4).map((r, i) => node(px(colX[2]), yB(i), r.name, r.points + ' PT', i < 2, 'b' + i))}
      {/* final */}
      {node(px(0.46), 244, '★ 总决赛 · BO5', '待定', true, 'final')}
      {/* connectors */}
      {[0, 1].map(i => <line key={'la' + i} x1={px(colX[0]) + 58} y1={yA(i)} x2={px(colX[1]) - 58} y2={i === 0 ? 84 : 164} stroke={c} strokeWidth="1" opacity="0.5" strokeDasharray="3 3" />)}
      {[0, 1].map(i => <line key={'lb' + i} x1={px(colX[2]) - 58} y1={yB(i)} x2={px(colX[1]) + 58} y2={i === 0 ? 164 : 84} stroke={c} strokeWidth="1" opacity="0.5" strokeDasharray="3 3" />)}
      <line x1={px(colX[1])} y1={99} x2={px(0.46)} y2={229} stroke={c} strokeWidth="1" opacity="0.4" strokeDasharray="3 3" />
      <line x1={px(colX[1])} y1={179} x2={px(0.46)} y2={229} stroke={c} strokeWidth="1" opacity="0.4" strokeDasharray="3 3" />
    </svg>
  );
}

/* ---- GroupBars: standings as horizontal point bars ---- */
function GroupBars({ rows, color }) {
  const c = color || _A();
  const max = Math.max(...rows.map(r => r.points), 3);
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px 96px 1fr auto', alignItems: 'center', gap: 9 }}>
          <span className="readout" style={{ fontSize: 12, color: i < 2 ? c : _FT(), fontWeight: 700 }}>{r.rank}</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ height: 8, background: 'rgb(var(--line))', borderRadius: 2, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: (r.points / max * 100) + '%', background: i < 2 ? c : _DM(), boxShadow: i < 2 ? '0 0 7px ' + c + '88' : 'none' }} />
          </span>
          <span className="readout" style={{ fontSize: 11, color: _DM() }}>{r.wins}-{r.losses}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { PlayerRadar, FormDots, KdaBars, WinDonut, ChampBars, PosPip, BracketMap, GroupBars });
