/* NEXUS — public-side expansions: shared new visualizations + 战队主页 + 数据中心.
   All deterministic from window.LOL_DATA. Exports TeamPage, DataCenter + viz helpers. */
const DP = window.LOL_DATA;
const { useState: pS, useEffect: pE, useMemo: pM } = React;

/* ---- aggregate helpers ---- */
function profileById(id) { return DP.profiles.find(p => p.playerId === id); }
function teamRecord(id) { for (const g of DP.standings) { const r = g.rows.find(x => x.teamId === id); if (r) return r; } return null; }
function teamMatches(id) { return DP.matches.filter(m => (m.teamA && m.teamA.id === id) || (m.teamB && m.teamB.id === id)); }
function teamRoster(id) { const t = DP.teams.find(x => x.id === id); return t ? t.slots.map(s => s.registration).filter(Boolean) : []; }
function teamAgg(id) {
  const ps = teamRoster(id).map(p => profileById(p.id)).filter(Boolean);
  if (!ps.length) return null;
  const sum = (f) => ps.reduce((a, p) => a + f(p.summary), 0);
  return {
    kda: (sum(s => s.kda) / ps.length),
    winRate: Math.round(sum(s => s.winRate) / ps.length),
    kills: (sum(s => s.avgKills) / ps.length),
    gold: (sum(s => s.avgGold) / ps.length),
    dmg: (sum(s => s.avgDamage) / ps.length),
    cs: (sum(s => s.avgCs) / ps.length),
    mvp: sum(s => s.mvpCount),
    games: sum(s => s.games),
  };
}
const FIELD_AGG = (() => {
  const all = DP.profiles;
  const sum = (f) => all.reduce((a, p) => a + f(p.summary), 0);
  return { kda: sum(s => s.kda) / all.length, winRate: 50, kills: sum(s => s.avgKills) / all.length, gold: sum(s => s.avgGold) / all.length, dmg: sum(s => s.avgDamage) / all.length, cs: sum(s => s.avgCs) / all.length };
})();

/* ===================== shared visualizations ===================== */

/* dual-overlay 5-axis radar (team vs field, or A vs B) */
function CompareRadar({ a, b, labels, size = 230, aColor = 'rgb(var(--accent))', bColor = 'rgb(var(--accent-2))' }) {
  const cx = size / 2, cy = size / 2, R = size * 0.34, n = labels.length;
  const ang = (i) => (Math.PI / 180) * (-90 + i * (360 / n));
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
  const ring = (r) => labels.map((_, i) => pt(i, r).join(',')).join(' ');
  const poly = (vals) => vals.map((v, i) => pt(i, Math.max(0.05, Math.min(1, v))).join(',')).join(' ');
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((r, i) => <polygon key={i} points={ring(r)} fill="none" stroke="rgb(var(--line))" strokeWidth="0.7" />)}
      {labels.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--line) / 0.6)" strokeWidth="0.6" />; })}
      {b && <polygon points={poly(b)} fill={bColor.replace(')', ' / 0.14)').replace('rgb(', 'rgb(')} stroke={bColor} strokeWidth="1.4" strokeLinejoin="round" style={{ fillOpacity: 0.12 }} />}
      <polygon points={poly(a)} fill={aColor} stroke={aColor} strokeWidth="1.6" strokeLinejoin="round" style={{ fillOpacity: 0.2, filter: 'drop-shadow(0 0 5px rgb(var(--accent) / 0.5))' }} />
      {labels.map((l, i) => { const [x, y] = pt(i, 1.3); return <text key={i} x={x} y={y + 2.5} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fill: 'rgb(var(--faint))' }}>{l}</text>; })}
    </svg>
  );
}

/* champion usage heat bars */
function ChampHeat({ rows, max }) {
  const mx = max || Math.max(...rows.map(r => r.games), 1);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 92 }}><ChampAvatar name={r.name} size={20} /><span style={{ fontSize: 12, color: 'rgb(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span></span>
          <div style={{ height: 8, background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--line))', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: (r.games / mx * 100) + '%', background: r.winRate >= 55 ? 'rgb(var(--good) / 0.8)' : r.winRate >= 45 ? 'rgb(var(--accent) / 0.8)' : 'rgb(var(--bad) / 0.7)' }}></div>
          </div>
          <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--dim))', width: 64, textAlign: 'right' }}>{r.games} 场 · {r.winRate}%</span>
        </div>
      ))}
    </div>
  );
}

/* position meta donut */
function MetaDonut({ data, size = 150 }) {
  const total = data.reduce((a, d) => a + d.v, 0) || 1;
  const r = size * 0.36, cx = size / 2, cy = size / 2, cir = 2 * Math.PI * r;
  let acc = 0;
  const cols = ['rgb(var(--accent))', 'rgb(var(--accent-2))', 'rgb(var(--gold))', 'rgb(var(--good))', 'rgb(var(--neon-2, var(--accent-2)))'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--panel-2))" strokeWidth={size * 0.13} />
        {data.map((d, i) => { const frac = d.v / total; const dash = frac * cir; const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={cols[i % cols.length]} strokeWidth={size * 0.13} strokeDasharray={dash + ' ' + (cir - dash)} strokeDashoffset={-acc * cir} />; acc += frac; return el; })}
      </svg>
      <div style={{ display: 'grid', gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 9, height: 9, background: cols[i % cols.length], display: 'inline-block' }}></span>
            <span className="label" style={{ fontSize: 11 }}>{d.label}</span>
            <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--ink))', marginLeft: 'auto' }}>{d.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* season win/loss trend line */
function SeasonTrend({ games, w = 320, h = 70 }) {
  if (!games || !games.length) return null;
  let cum = 0; const pts = games.map((g, i) => { cum += g.win ? 1 : -1; return cum; });
  const min = Math.min(0, ...pts), max = Math.max(1, ...pts), span = max - min || 1;
  const X = (i) => 6 + (i / (pts.length - 1 || 1)) * (w - 12);
  const Y = (v) => h - 8 - ((v - min) / span) * (h - 16);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const zeroY = Y(0);
  return (
    <svg viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: h }}>
      <line x1="6" y1={zeroY} x2={w - 6} y2={zeroY} stroke="rgb(var(--line))" strokeWidth="0.8" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px rgb(var(--accent) / 0.5))' }} />
      {pts.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r="2.4" fill={games[i].win ? 'rgb(var(--good))' : 'rgb(var(--bad))'} />)}
    </svg>
  );
}

/* live countdown bar to next scheduled match */
function Countdown({ to, label }) {
  const [now, setNow] = pS(Date.now());
  pE(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86400000), hh = Math.floor(diff % 86400000 / 3600000), mm = Math.floor(diff % 3600000 / 60000), ss = Math.floor(diff % 60000 / 1000);
  const cell = (v, u) => <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}><span className="readout" style={{ fontSize: 20, fontWeight: 700, color: 'rgb(var(--accent))' }}>{('0' + v).slice(-2)}</span><span className="kicker" style={{ fontSize: 7.5 }}>{u}</span></span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className="kicker" style={{ fontSize: 9 }}>{label}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{cell(d, 'DAY')}<span style={{ color: 'rgb(var(--faint))' }}>:</span>{cell(hh, 'HR')}<span style={{ color: 'rgb(var(--faint))' }}>:</span>{cell(mm, 'MIN')}<span style={{ color: 'rgb(var(--faint))' }}>:</span>{cell(ss, 'SEC')}</div>
    </div>
  );
}

/* ===================== TEAM PAGE ===================== */
function TeamPage({ teamId, onBack, onOpenMatch }) {
  const t = DP.teams.find(x => x.id === teamId) || DP.teams[0];
  const rec = teamRecord(t.id), agg = teamAgg(t.id);
  const roster = t.slots.map(s => ({ slot: s, prof: s.registration ? profileById(s.registration.id) : null }));
  const ms = teamMatches(t.id);
  const radarA = agg ? [Math.min(1, agg.kda / 6), agg.winRate / 100, Math.min(1, agg.kills / 8), Math.min(1, agg.gold / 16000), Math.min(1, agg.cs / 300)] : [.5, .5, .5, .5, .5];
  const radarB = [Math.min(1, FIELD_AGG.kda / 6), 0.5, Math.min(1, FIELD_AGG.kills / 8), Math.min(1, FIELD_AGG.gold / 16000), Math.min(1, FIELD_AGG.cs / 300)];
  // champion heat across roster
  const champ = {};
  roster.forEach(r => r.prof && r.prof.games.forEach(g => { champ[g.champion] = champ[g.champion] || { name: g.champion, games: 0, wins: 0 }; champ[g.champion].games++; if (g.win) champ[g.champion].wins++; }));
  const champRows = Object.values(champ).map(c => ({ name: c.name, games: c.games, winRate: Math.round(c.wins / c.games * 100) })).sort((a, b) => b.games - a.games).slice(0, 6);
  const fmt = (iso) => { const d = new Date(iso); return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 18 }}>
      <button className="btn btn-sm" style={{ width: 'fit-content' }} onClick={onBack}>← 返回</button>
      {/* hero */}
      <div className="panel glow" style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
        <div>
          <Kicker style={{ marginBottom: 8 }}>TEAM DOSSIER · {t.id.toUpperCase()}</Kicker>
          <div className="title-xl" style={{ fontSize: 46, color: 'rgb(var(--ink))' }}>{t.name}</div>
          <div className="serif-i" style={{ fontSize: 16, color: 'rgb(var(--dim))', marginTop: 4 }}>“{t.slogan}”</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <span className="chip ac">{t.group} 组</span>
            <span className="chip">队长 {t.captainNickname}</span>
            <span className="chip good">战绩 {rec ? rec.wins + '–' + rec.losses : '—'}</span>
            <span className="chip">积分 {rec ? rec.points : '—'}</span>
            <span className="chip">预算余 {t.budgetLeft} CR</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <WinDonut pct={agg ? agg.winRate : 50} size={120} />
          <div className="kicker" style={{ marginTop: 6 }}>队伍胜率</div>
        </div>
      </div>

      <div className="scr-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* roster */}
        <div className="panel">
          <PanelHead idx="ROSTER" title="首发阵容 · 5" />
          <div>
            {roster.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: i < 4 ? '1px solid rgb(var(--line) / 0.4)' : 'none' }}>
                <PosPip pos={r.slot.position} on={!!r.slot.registration} size={28} />
                <div style={{ minWidth: 0 }}>
                  {r.slot.registration
                    ? <PlayerHover playerId={r.slot.registration.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--ink))', cursor: 'help' }}>{r.slot.registration.nickname}{r.slot.registration.isCaptain && <span style={{ color: 'rgb(var(--gold))', marginLeft: 5, fontSize: 11 }}>★</span>}</span></PlayerHover>
                    : <span className="readout" style={{ color: 'rgb(var(--faint))' }}>空缺</span>}
                  <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{DP.POS_LABEL[r.slot.position]}{r.prof ? ' · KDA ' + r.prof.summary.kda : ''}</div>
                </div>
                {r.prof && <Sparkline data={r.prof.recentForm.map(w => w ? 1 : 0)} w={54} h={18} color="rgb(var(--accent))" dot />}
                <span className="readout accent-t" style={{ fontSize: 12 }}>{r.slot.registration ? r.slot.registration.cost + ' CR' : '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* team radar + champ heat */}
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="panel">
            <PanelHead idx="POWER" title="战力雷达 · 对比联盟均值" right={<span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>队伍 / 均值</span>} />
            <div style={{ padding: 16, display: 'grid', placeItems: 'center' }}>
              <CompareRadar a={radarA} b={radarB} labels={['KDA', '胜率', '击杀', '经济', '补刀']} size={230} />
            </div>
          </div>
          <div className="panel">
            <PanelHead idx="CHAMP" title="战队英雄池" />
            <div style={{ padding: 16 }}>{champRows.length ? <ChampHeat rows={champRows} /> : <div className="readout" style={{ color: 'rgb(var(--faint))' }}>暂无数据</div>}</div>
          </div>
        </div>
      </div>

      {/* schedule */}
      <div className="panel">
        <PanelHead idx="FIXTURES" title={'赛程战绩 · ' + ms.length} />
        <div>
          {ms.map((m) => {
            const isA = m.teamA && m.teamA.id === t.id;
            const opp = isA ? m.teamB : m.teamA;
            const win = m.winnerTeamId === t.id;
            return (
              <div key={m.id} className="matchrow clickable" style={{ gridTemplateColumns: '90px 60px 1fr auto auto' }} onClick={() => onOpenMatch(m)}>
                <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{fmt(m.scheduledAt)}</span>
                <span className="chip" style={{ borderColor: 'rgb(var(--line))' }}>{m.label.slice(0, 4)}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--ink))' }}>vs {opp ? opp.name : '待定'}</span>
                <span>{m.status === 'FINISHED' ? <span className="chip" style={win ? { borderColor: 'rgb(var(--good) / 0.6)', color: 'rgb(var(--good))' } : { borderColor: 'rgb(var(--bad) / 0.5)', color: 'rgb(var(--bad))' }}>{win ? '胜' : '负'}</span> : <span className="chip ac">未开始</span>}</span>
                <span className="row-go readout" style={{ fontSize: 13 }}>▸</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ===================== DATA CENTER ===================== */
function DataCenter({ onOpenTeam }) {
  const allGames = pM(() => DP.profiles.flatMap(p => p.games), []);
  const champ = pM(() => {
    const m = {};
    allGames.forEach(g => { m[g.champion] = m[g.champion] || { name: g.champion, games: 0, wins: 0 }; m[g.champion].games++; if (g.win) m[g.champion].wins++; });
    return Object.values(m).map(c => ({ name: c.name, games: c.games, winRate: Math.round(c.wins / c.games * 100) })).sort((a, b) => b.games - a.games);
  }, [allGames]);
  const posMeta = DP.POSITIONS.map(p => ({ label: DP.POS_LABEL[p], v: DP.players.filter(x => x.primaryPositions[0] === p).length }));
  const totalKills = allGames.reduce((a, g) => a + g.kills, 0);
  const mvpBoard = [...DP.profiles].sort((a, b) => b.summary.mvpCount - a.summary.mvpCount).slice(0, 5);
  const powerRank = DP.standings.flatMap(g => g.rows).map(r => ({ ...r, agg: teamAgg(r.teamId) })).sort((a, b) => b.points - a.points || (b.agg ? b.agg.kda : 0) - (a.agg ? a.agg.kda : 0));

  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 18 }}>
      <div className="quad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <div className="dtile"><div className="kicker" style={{ marginBottom: 9 }}>对局总数</div><div className="v readout">{allGames.length}</div><div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>跨全部选手</div></div>
        <div className="dtile"><div className="kicker" style={{ marginBottom: 9 }}>击杀总数</div><div className="v readout">{totalKills}</div><div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>场均 {(totalKills / allGames.length).toFixed(1)}</div></div>
        <div className="dtile"><div className="kicker" style={{ marginBottom: 9 }}>登场英雄</div><div className="v readout">{champ.length}</div><div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>英雄池广度</div></div>
        <div className="dtile"><div className="kicker" style={{ marginBottom: 9 }}>选手</div><div className="v readout">{DP.profiles.length}</div><div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>已入池</div></div>
      </div>

      <div className="scr-2col" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
        <div className="panel">
          <PanelHead idx="META" title="英雄登场率 · TOP 10" right={<span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>PICK RATE</span>} />
          <div style={{ padding: 16 }}><ChampHeat rows={champ.slice(0, 10)} /></div>
        </div>
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="panel">
            <PanelHead idx="ROLE" title="位置 Meta · 分布" />
            <div style={{ padding: 18 }}><MetaDonut data={posMeta} size={150} /></div>
          </div>
          <div className="panel scan">
            <PanelHead idx="MVP" title="MVP 看板" />
            <div style={{ padding: '6px 0' }}>
              {mvpBoard.map((p, i) => (
                <div key={p.playerId} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: i < 4 ? '1px solid rgb(var(--line) / 0.35)' : 'none' }}>
                  <span className="readout" style={{ fontSize: 13, color: i < 3 ? 'rgb(var(--gold))' : 'rgb(var(--faint))', fontWeight: 700 }}>{i + 1}</span>
                  <PlayerHover playerId={p.playerId}><span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))', cursor: 'help' }}>{p.nickname}</span></PlayerHover>
                  <span className="readout" style={{ fontSize: 13, color: 'rgb(var(--gold))', fontWeight: 700 }}>★ {p.summary.mvpCount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* power ranking */}
      <div className="panel">
        <PanelHead idx="POWER" title="战力排行 · 8 队" right={<span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>点击进入战队主页</span>} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['#', '战队', '组', '胜', '负', '积分', '场均KDA', '场均经济'].map((h, i) => <th key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: i > 2 ? 'center' : 'left', padding: '10px 14px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}</tr></thead>
          <tbody>
            {powerRank.map((r, i) => (
              <tr key={r.teamId} className="row-hover lbrow" style={{ display: 'table-row', cursor: 'pointer' }} onClick={() => onOpenTeam(r.teamId)}>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}><span className="readout accent-t" style={{ fontWeight: 700 }}>{i + 1}</span></td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgb(var(--ink))' }}>{r.name}</td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}><span className="chip">{DP.teams.find(t => t.id === r.teamId).group}</span></td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }} className="readout">{r.wins}</td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }} className="readout">{r.losses}</td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }}><span className="readout" style={{ fontWeight: 700, color: 'rgb(var(--ink))' }}>{r.points}</span></td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }} className="readout accent-t">{r.agg ? r.agg.kda.toFixed(2) : '—'}</td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }} className="readout">{r.agg ? (r.agg.gold / 1000).toFixed(1) + 'K' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- knockout bracket: clickable SF1/SF2 → Final ---- */
function KoNode({ m, label, gold, onOpen }) {
  const aName = m && m.teamA ? m.teamA.name : '待定';
  const bName = m && m.teamB ? m.teamB.name : '待定';
  const fin = m && m.status === 'FINISHED';
  const aWin = fin && m.teamA && m.winnerTeamId === m.teamA.id;
  const bWin = fin && m.teamB && m.winnerTeamId === m.teamB.id;
  const row = (name, win) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px', background: win ? 'rgb(var(--accent) / 0.1)' : 'transparent', borderLeft: '2px solid ' + (win ? 'rgb(var(--accent))' : 'transparent') }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: win ? 'rgb(var(--accent))' : (name === '待定' ? 'rgb(var(--faint))' : 'rgb(var(--ink))'), fontWeight: win ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <span className="readout" style={{ fontSize: 13, color: win ? 'rgb(var(--accent))' : 'rgb(var(--dim))', fontWeight: 700 }}>{fin ? (win ? '1' : '0') : '–'}</span>
    </div>
  );
  return (
    <button onClick={() => m && onOpen(m)} className="panel-2" style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid ' + (gold ? 'rgb(var(--gold) / 0.5)' : 'rgb(var(--line))'), background: 'rgb(var(--panel-2))', cursor: m ? 'pointer' : 'default', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 11px', borderBottom: '1px solid rgb(var(--line))' }}>
        <span className="kicker" style={{ fontSize: 8.5, color: gold ? 'rgb(var(--gold))' : 'rgb(var(--faint))' }}>{label}</span>
        <span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>BO{m ? m.bestOf : '-'}</span>
      </div>
      {row(aName, aWin)}
      <div style={{ height: 1, background: 'rgb(var(--line) / 0.5)' }}></div>
      {row(bName, bWin)}
    </button>
  );
}
function KoTree({ onOpenMatch }) {
  const g = (id) => DP.matches.find(m => m.id === id);
  const sf1 = g('m_sf1'), sf2 = g('m_sf2'), fin = g('m_final');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 1fr', alignItems: 'center', padding: '14px 8px' }}>
      <div style={{ display: 'grid', gap: 48 }}>
        <KoNode m={sf1} label="半决赛 1" onOpen={onOpenMatch} />
        <KoNode m={sf2} label="半决赛 2" onOpen={onOpenMatch} />
      </div>
      <div style={{ position: 'relative', alignSelf: 'stretch', minHeight: 120 }}>
        <div style={{ position: 'absolute', left: 0, width: '50%', top: '25%', borderTop: '2px solid rgb(var(--line))' }}></div>
        <div style={{ position: 'absolute', left: 0, width: '50%', bottom: '25%', borderTop: '2px solid rgb(var(--line))' }}></div>
        <div style={{ position: 'absolute', left: '50%', top: '25%', bottom: '25%', borderLeft: '2px solid rgb(var(--line))' }}></div>
        <div style={{ position: 'absolute', left: '50%', width: '50%', top: '50%', borderTop: '2px solid rgb(var(--accent))' }}></div>
      </div>
      <div><KoNode m={fin} label="总决赛" gold onOpen={onOpenMatch} /></div>
    </div>
  );
}

/* ---- today's fixtures timeline ---- */
function TodayTimeline({ onOpenMatch }) {
  const byDay = {};
  DP.matches.forEach(m => { const d = new Date(m.scheduledAt); const k = (d.getMonth() + 1) + '/' + d.getDate(); (byDay[k] = byDay[k] || []).push(m); });
  const entry = Object.entries(byDay).sort((a, b) => b[1].length - a[1].length)[0];
  const ms = entry[1].slice().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 6);
  const hm = (iso) => { const d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  return (
    <div className="panel">
      <PanelHead idx="TODAY" title={'今日赛程 · ' + entry[0]} right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{ms.length} 场</span>} />
      <div style={{ padding: '14px 12px 16px' }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ position: 'absolute', left: '6%', right: '6%', top: 30, height: 2, background: 'rgb(var(--line))' }}></div>
          {ms.map((m) => {
            const fin = m.status === 'FINISHED';
            return (
              <button key={m.id} onClick={() => onOpenMatch(m)} style={{ flex: 1, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 0, padding: '0 4px' }}>
                <span className="readout" style={{ fontSize: 11, color: fin ? 'rgb(var(--accent))' : 'rgb(var(--hot))', marginBottom: 7 }}>{hm(m.scheduledAt)}</span>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: fin ? 'rgb(var(--accent))' : 'rgb(var(--panel))', border: '2px solid ' + (fin ? 'rgb(var(--accent))' : 'rgb(var(--hot))'), boxShadow: fin ? '0 0 8px rgb(var(--accent) / 0.6)' : '0 0 8px rgb(var(--hot) / 0.5)', zIndex: 1 }}></span>
                <span style={{ marginTop: 11, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'rgb(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.teamA ? m.teamA.name.slice(0, 4) : '待定'}</span>
                <span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>vs</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'rgb(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.teamB ? m.teamB.name.slice(0, 4) : '待定'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- MVP board ---- */
function MvpStrip() {
  const top = [...DP.profiles].sort((a, b) => b.summary.mvpCount - a.summary.mvpCount).slice(0, 3);
  const medal = ['rgb(var(--gold))', 'rgb(var(--dim))', 'rgb(var(--hot))'];
  return (
    <div className="panel">
      <PanelHead idx="MVP" title="MVP 看板 · TOP 3" />
      <div style={{ padding: '8px 0' }}>
        {top.map((p, i) => (
          <div key={p.playerId} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', alignItems: 'center', gap: 11, padding: '10px 16px', borderBottom: i < 2 ? '1px solid rgb(var(--line) / 0.4)' : 'none' }}>
            <span className="readout" style={{ fontSize: 18, fontWeight: 700, color: medal[i] }}>{i + 1}</span>
            <PosPip pos={(DP.players.find(x => x.id === p.playerId) || {}).primaryPositions[0]} on={i === 0} size={28} />
            <div style={{ minWidth: 0 }}>
              <PlayerHover playerId={p.playerId}><div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--ink))', cursor: 'help', width: 'fit-content', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname}</div></PlayerHover>
              <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{p.teamName}</div>
            </div>
            <span className="readout" style={{ fontSize: 15, fontWeight: 700, color: 'rgb(var(--gold))' }}>★ {p.summary.mvpCount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- top-of-table teams compare radar ---- */
function TopTeamsCompare() {
  const a1 = DP.standings[0].rows[0], b1 = DP.standings[1].rows[0];
  const aAgg = teamAgg(a1.teamId), bAgg = teamAgg(b1.teamId);
  const norm = (g) => g ? [Math.min(1, g.kda / 6), g.winRate / 100, Math.min(1, g.kills / 8), Math.min(1, g.gold / 16000), Math.min(1, g.cs / 300)] : [.5, .5, .5, .5, .5];
  const leg = (col, name) => <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, background: col, display: 'inline-block' }}></span><span className="readout" style={{ fontSize: 11, color: 'rgb(var(--ink))' }}>{name}</span></span>;
  return (
    <div className="panel">
      <PanelHead idx="VERSUS" title="榜首对比 · 战力" />
      <div style={{ padding: 16, display: 'grid', placeItems: 'center' }}>
        <CompareRadar a={norm(aAgg)} b={norm(bAgg)} labels={['KDA', '胜率', '击杀', '经济', '补刀']} size={216} />
        <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>{leg('rgb(var(--accent))', a1.name)}{leg('rgb(var(--accent-2))', b1.name)}</div>
      </div>
    </div>
  );
}

Object.assign(window, { TeamPage, DataCenter, CompareRadar, ChampHeat, MetaDonut, SeasonTrend, Countdown, KoTree, TodayTimeline, MvpStrip, TopTeamsCompare, profileById, teamRecord, teamMatches, teamAgg });
