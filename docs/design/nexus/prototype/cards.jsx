/* NEXUS — reusable hover cards (player / team mini-files) + the HoverCard wrapper.
   HoverCard clones its single child and injects hover handlers + a ref (no extra DOM,
   so it never disturbs grid/flex layouts). The floating card is portaled to <body>. */
const DC = window.LOL_DATA;
const { useState: hS, useRef: hR, useEffect: hE } = React;

function _player(id) { return DC.players.find(p => p.id === id); }
function _profile(id) { return DC.profiles.find(p => p.playerId === id); }
function _team(id) { return DC.teams.find(t => t.id === id); }
function _teamRecord(id) {
  for (const g of DC.standings) { const r = g.rows.find(x => x.teamId === id); if (r) return r; }
  return null;
}

/* ---------------- mini visuals ---------------- */
/* 6-axis hexagon ability chart (LoL-client style) */
function HexRadar({ vals, size = 118 }) {
  const cx = size / 2, cy = size / 2, R = size * 0.30;
  const ang = (i) => (Math.PI / 180) * (-90 + i * 60);
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
  const ring = (r) => vals.map((_, i) => pt(i, r).join(',')).join(' ');
  const poly = vals.map((a, i) => pt(i, Math.max(0.05, Math.min(1, a.v))).join(',')).join(' ');
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((r, i) => <polygon key={i} points={ring(r)} fill="none" stroke="rgb(var(--line))" strokeWidth="0.7" />)}
      {vals.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--line) / 0.6)" strokeWidth="0.6" />; })}
      <polygon points={poly} fill="rgb(var(--accent) / 0.2)" stroke="rgb(var(--accent))" strokeWidth="1.4" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 5px rgb(var(--accent) / 0.5))' }} />
      {vals.map((a, i) => { const [x, y] = pt(i, Math.max(0.05, Math.min(1, a.v))); return <circle key={i} cx={x} cy={y} r="2" fill="rgb(var(--accent))" />; })}
      {vals.map((a, i) => { const [x, y] = pt(i, 1.32); return <text key={i} x={x} y={y + 2.5} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fill: 'rgb(var(--faint))', letterSpacing: '0.04em' }}>{a.label}</text>; })}
    </svg>
  );
}
function hexFrom(s) {
  const cl = (x) => Math.max(0.05, Math.min(1, x));
  return [
    { label: '击杀', v: cl(s.avgKills / 8) },
    { label: '生存', v: cl(1 - s.avgDeaths / 8) },
    { label: '输出', v: cl(s.avgDamage / 36000) },
    { label: '经济', v: cl(s.avgGold / 16000) },
    { label: '补刀', v: cl(s.avgCs / 300) },
    { label: '团战', v: cl(s.avgAssists / 16) },
  ];
}
/* stylized champion avatar (no real art assets → monogram tile, hex on command) */
function ChampAvatar({ name, size = 26 }) {
  return (
    <span className="champ-av" style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: 'none', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.46, color: 'rgb(var(--ink))', background: 'linear-gradient(135deg, rgb(var(--accent) / 0.28), rgb(var(--panel-2)))', border: '1px solid rgb(var(--line))' }}>{name ? name[0] : '?'}</span>
  );
}

/* ---------------- HoverCard wrapper ---------------- */
function HoverCard({ children, render, w = 268 }) {
  const [pos, setPos] = hS(null);
  const ref = hR(null), timer = hR(null);
  const enter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, estH = 300;
      let left = r.right + 12;
      if (left + w > vw - 12) left = r.left - w - 12;       // flip to the left
      if (left < 12) left = Math.min(Math.max(12, r.left), vw - w - 12);
      let top = r.top + r.height / 2 - estH / 2;
      top = Math.max(12, Math.min(top, vh - estH - 12));
      setPos({ left, top });
    }, 110);
  };
  const leave = () => { clearTimeout(timer.current); setPos(null); };
  hE(() => () => clearTimeout(timer.current), []);

  const child = React.Children.only(children);
  const cloned = React.cloneElement(child, {
    ref: (n) => { ref.current = n; const cr = child.ref; if (typeof cr === 'function') cr(n); else if (cr) cr.current = n; },
    onMouseOver: (e) => { enter(); child.props.onMouseOver && child.props.onMouseOver(e); },
    onMouseLeave: (e) => { leave(); child.props.onMouseLeave && child.props.onMouseLeave(e); },
  });
  return (
    <React.Fragment>
      {cloned}
      {pos && ReactDOM.createPortal(
        <div style={{ position: 'fixed', left: pos.left, top: pos.top, width: w, zIndex: 9999, pointerEvents: 'none' }}>
          <div className="panel glow hovercard-in" style={{ padding: 0, overflow: 'hidden' }}>{render()}</div>
        </div>, document.body)}
    </React.Fragment>
  );
}

/* ---------------- Player mini-file ---------------- */
function PlayerCardBody({ playerId }) {
  const pl = _player(playerId), pf = _profile(playerId);
  if (!pl) return null;
  const posKey = pl.primaryPositions[0];
  const s = pf && pf.summary;
  const stat = (label, val, accent) => (
    <div style={{ textAlign: 'center' }}>
      <div className="kicker" style={{ fontSize: 8.5, marginBottom: 3 }}>{label}</div>
      <div className="readout" style={{ fontSize: 16, fontWeight: 700, color: accent ? 'rgb(var(--accent))' : 'rgb(var(--ink))' }}>{val}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px 11px', borderBottom: '1px solid rgb(var(--line))' }}>
        <PosPip pos={posKey} on size={40} />
        <div style={{ minWidth: 0 }}>
          <div className="title-xl" style={{ fontSize: 19, color: 'rgb(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.nickname}</div>
          <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{(pf && pf.teamName) || '选手池'} · {DC.POS_LABEL[posKey]}</div>
        </div>
        {pl.isCaptain && <span className="chip ac" style={{ marginLeft: 'auto' }}>队长</span>}
      </div>
      {s ? (
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <HexRadar vals={hexFrom(s)} size={120} />
            <div style={{ display: 'grid', gap: 9, justifyItems: 'center' }}>
              <WinDonut pct={s.winRate} size={62} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
                {stat('KDA', s.kda, true)}
                {stat('输出', (s.avgDamage / 1000).toFixed(1) + 'K')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="kicker" style={{ fontSize: 8.5 }}>近期战绩</span>
            <FormDots form={pf.recentForm} size={12} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pf.commonChampions.slice(0, 3).map((c, i) => (
              <span key={i} className="chip" style={{ fontSize: 9.5, gap: 5, paddingLeft: 4 }}><ChampAvatar name={c.championName} size={15} />{c.championName} · {c.games}</span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">当前段位</span><span className="readout accent-t">{pl.currentRank}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">最高段位</span><span className="readout" style={{ color: 'rgb(var(--ink))' }}>{pl.peakRank}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">报名身价</span><span className="readout accent-t">{pl.cost} CR</span></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Team mini-file ---------------- */
function TeamCardBody({ teamId }) {
  const t = _team(teamId); if (!t) return null;
  const rec = _teamRecord(teamId);
  return (
    <div>
      <div style={{ padding: '13px 14px 11px', borderBottom: '1px solid rgb(var(--line))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="title-xl" style={{ fontSize: 20, color: 'rgb(var(--ink))' }}>{t.name}</div>
          <span className="chip">{t.group} 组</span>
        </div>
        <div className="serif-i" style={{ fontSize: 12.5, color: 'rgb(var(--dim))', marginTop: 3 }}>“{t.slogan}”</div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}><div className="kicker" style={{ fontSize: 8.5, marginBottom: 3 }}>战绩</div><div className="readout" style={{ fontSize: 15, fontWeight: 700, color: 'rgb(var(--ink))' }}>{rec ? rec.wins + '–' + rec.losses : '—'}</div></div>
          <div style={{ textAlign: 'center' }}><div className="kicker" style={{ fontSize: 8.5, marginBottom: 3 }}>积分</div><div className="readout accent-t" style={{ fontSize: 15, fontWeight: 700 }}>{rec ? rec.points : '—'}</div></div>
          <div style={{ textAlign: 'center' }}><div className="kicker" style={{ fontSize: 8.5, marginBottom: 3 }}>预算余</div><div className="readout" style={{ fontSize: 15, fontWeight: 700, color: 'rgb(var(--ink))' }}>{t.budgetLeft}</div></div>
        </div>
        <div className="kicker" style={{ fontSize: 8.5, marginBottom: 8 }}>首发阵容</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {t.slots.map((sl, i) => (
            <div key={i} style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <PosPip pos={sl.position} on={!!sl.registration} size={26} />
              <div className="readout" style={{ fontSize: 8.5, color: 'rgb(var(--dim))', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 1px' }}>{sl.registration ? sl.registration.nickname.slice(0, 4) : '空'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* convenience wrappers */
function PlayerHover({ playerId, w = 296, children }) { return <HoverCard w={w} render={() => <PlayerCardBody playerId={playerId} />}>{children}</HoverCard>; }
function TeamHover({ teamId, w = 268, children }) { return <HoverCard w={w} render={() => <TeamCardBody teamId={teamId} />}>{children}</HoverCard>; }

Object.assign(window, { HoverCard, PlayerCardBody, TeamCardBody, PlayerHover, TeamHover, HexRadar, ChampAvatar });
