/* NEXUS — single-match detail. The mock DB stores only schedule + winner, so a full
   box score is synthesized deterministically from match.id (same id → same numbers).
   Exports: MatchDetail({ match, onClose }). */
const DM2 = window.LOL_DATA;
const { useEffect: mE } = React;

function _seed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function _teamObj(id) { return DM2.teams.find(t => t.id === id); }

/* build a deterministic box score for a finished BO1 */
function buildMatch(match) {
  const rng = _seed(match.id);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const ta = match.teamA && _teamObj(match.teamA.id);
  const tb = match.teamB && _teamObj(match.teamB.id);
  const aWin = match.winnerTeamId && match.teamA && match.winnerTeamId === match.teamA.id;
  const duration = ri(24, 41), durSec = ri(0, 59);
  const CH = DM2.CHAMP_SET;

  function side(team, isWin) {
    const base = isWin ? 1 : 0;
    const roster = team ? team.slots.map(s => s.registration).filter(Boolean) : [];
    let kills = 0, gold = 0, dmg = 0;
    const lines = roster.map((p) => {
      const k = ri(base, base ? 9 : 6) + (isWin ? ri(0, 3) : 0);
      const d = ri(isWin ? 0 : 1, isWin ? 5 : 8);
      const a = ri(2, 16);
      const cs = ri(120, 300), gd = ri(9000, 17000), dm = ri(9000, 38000);
      kills += k; gold += gd; dmg += dm;
      return { pos: p.position, nick: p.nickname, id: p.id, champ: CH[Math.floor(rng() * CH.length)], k, d, a, cs, gold: gd, dmg: dm };
    });
    return { team, isWin, lines, kills, gold, towers: isWin ? ri(7, 11) : ri(1, 6), drakes: isWin ? ri(2, 4) : ri(0, 3), barons: isWin ? ri(1, 2) : ri(0, 1), dmg };
  }
  const A = side(ta, aWin), B = side(tb, !aWin);
  // MVP = best (k+a)/max(1,d) on winning side
  const winSide = aWin ? A : B;
  let mvp = winSide.lines[0];
  winSide.lines.forEach(l => { if ((l.k + l.a) / Math.max(1, l.d) > (mvp.k + mvp.a) / Math.max(1, mvp.d)) mvp = l; });

  // key events
  const winName = (aWin ? ta : tb).name, loseName = (aWin ? tb : ta).name;
  const ev = [];
  ev.push({ t: '03:1' + ri(0, 9), tag: 'FIRST BLOOD', text: (rng() > 0.5 ? winName : loseName) + ' 拿下一血', kind: 'kill' });
  ev.push({ t: '08:' + ri(10, 59), tag: 'DRAGON', text: winName + ' 控下首条小龙', kind: 'obj' });
  ev.push({ t: '14:' + ri(10, 59), tag: 'HERALD', text: loseName + ' 召唤先锋推进上路', kind: 'obj' });
  ev.push({ t: '21:' + ri(10, 59), tag: 'BARON', text: winName + ' 击杀纳什男爵', kind: 'baron' });
  ev.push({ t: (duration - 3) + ':' + ri(10, 59), tag: 'ACE', text: winName + ' 团灭对手', kind: 'ace' });
  ev.push({ t: duration + ':' + ('0' + durSec).slice(-2), tag: 'NEXUS', text: winName + ' 摧毁基地 · 获胜', kind: 'end' });

  return { match, A, B, aWin, duration, durSec, mvp, mvpSide: aWin ? 'A' : 'B', events: ev, ta, tb };
}

function _fmtDate(iso) { const d = new Date(iso); return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

function CompareBar({ label, a, b }) {
  const total = Math.max(1, a + b);
  const ap = (a / total) * 100, bp = 100 - ap;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span className="readout" style={{ fontSize: 14, fontWeight: 700, color: a >= b ? 'rgb(var(--accent))' : 'rgb(var(--dim))' }}>{a}</span>
        <span className="kicker" style={{ fontSize: 8.5 }}>{label}</span>
        <span className="readout" style={{ fontSize: 14, fontWeight: 700, color: b >= a ? 'rgb(var(--accent-2))' : 'rgb(var(--dim))' }}>{b}</span>
      </div>
      <div style={{ display: 'flex', height: 6, gap: 2 }}>
        <div style={{ width: ap + '%', background: 'rgb(var(--accent))', borderRadius: '2px 0 0 2px' }}></div>
        <div style={{ width: bp + '%', background: 'rgb(var(--accent-2) / 0.7)', borderRadius: '0 2px 2px 0' }}></div>
      </div>
    </div>
  );
}

function LineupTable({ side, accentVar, mvpId }) {
  if (!side.team) return <div className="readout" style={{ padding: 16, color: 'rgb(var(--faint))' }}>阵容待定</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['', '选手', '英雄', 'K/D/A', '补刀', '输出'].map((h, i) => <th key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: i > 2 ? 'center' : 'left', padding: '7px 8px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}</tr></thead>
      <tbody>
        {side.lines.map((l, i) => (
          <tr key={i} style={{ background: l.id === mvpId ? 'rgb(var(--gold) / 0.08)' : 'transparent' }}>
            <td style={{ padding: '8px 6px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}><PosPip pos={l.pos} size={22} /></td>
            <td style={{ padding: '8px 8px', borderBottom: '1px solid rgb(var(--line) / 0.35)', whiteSpace: 'nowrap' }}>
              <PlayerHover playerId={l.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))', cursor: 'help', borderBottom: '1px dotted rgb(var(--faint))' }}>{l.nick}</span></PlayerHover>
              {l.id === mvpId && <span style={{ color: 'rgb(var(--gold))', marginLeft: 5, fontSize: 11 }}>★MVP</span>}
            </td>
            <td style={{ padding: '8px 8px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <ChampAvatar name={l.champ} size={24} />
                <span style={{ fontSize: 12, color: 'rgb(var(--dim))', whiteSpace: 'nowrap' }}>{l.champ}</span>
              </span>
            </td>
            <td className="readout" style={{ padding: '8px 8px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center', fontSize: 12 }}>{l.k}/{l.d}/{l.a}</td>
            <td className="readout" style={{ padding: '8px 8px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center', fontSize: 12, color: 'rgb(var(--dim))' }}>{l.cs}</td>
            <td className="readout" style={{ padding: '8px 8px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center', fontSize: 12, color: 'rgb(var(--dim))' }}>{(l.dmg / 1000).toFixed(1)}K</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchDetail({ match, onClose }) {
  mE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!match) return null;
  const finished = match.status === 'FINISHED';
  const known = match.teamA && match.teamB;
  const box = finished && known ? buildMatch(match) : null;
  const aName = match.teamA ? match.teamA.name : '待定';
  const bName = match.teamB ? match.teamB.name : '待定';
  const evColor = { kill: 'var(--bad)', obj: 'var(--accent-2)', baron: 'var(--gold)', ace: 'var(--bad)', end: 'var(--accent)' };

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgb(0 0 0 / 0.55)', backdropFilter: 'blur(2px)' }}></div>
      <div className="md-drawer scan" style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 'min(680px, 95vw)', background: 'rgb(var(--surface))', borderLeft: '1px solid rgb(var(--accent) / 0.4)', boxShadow: '-20px 0 60px rgb(0 0 0 / 0.5)', overflowY: 'auto' }}>
        {/* header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgb(var(--surface))', borderBottom: '1px solid rgb(var(--line))', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="readout" style={{ color: 'rgb(var(--accent))', fontSize: 11 }}>◇ MATCH</span>
            <span className="label" style={{ color: 'rgb(var(--ink))' }}>{match.label}</span>
            <span className="chip">BO{match.bestOf}</span>
            {finished ? <span className="chip good">已结束</span> : <span className="chip ac">未开始</span>}
          </div>
          <button className="btn btn-sm" onClick={onClose} style={{ width: 34, padding: 0 }}>✕</button>
        </div>

        {/* scoreline */}
        <div className="panel glow" style={{ margin: 18, padding: '20px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              {match.teamA
                ? <TeamHover teamId={match.teamA.id}><span className="title-xl" style={{ fontSize: 26, color: box && box.aWin ? 'rgb(var(--accent))' : 'rgb(var(--ink))', cursor: 'help' }}>{aName}</span></TeamHover>
                : <span className="title-xl" style={{ fontSize: 26, color: 'rgb(var(--faint))' }}>{aName}</span>}
              <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 4 }}>{match.teamA ? 'A 方 · 蓝色方' : '晋级待定'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              {finished
                ? <div className="readout" style={{ fontSize: 34, fontWeight: 700, color: 'rgb(var(--ink))', letterSpacing: 2 }}>{box && box.aWin ? '1' : '0'}<span style={{ color: 'rgb(var(--faint))', margin: '0 6px' }}>:</span>{box && !box.aWin ? '1' : '0'}</div>
                : <div className="title-xl" style={{ fontSize: 22, color: 'rgb(var(--accent))' }}>VS</div>}
              <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 4 }}>{box ? box.duration + ':' + ('0' + box.durSec).slice(-2) : _fmtDate(match.scheduledAt).slice(5)}</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              {match.teamB
                ? <TeamHover teamId={match.teamB.id}><span className="title-xl" style={{ fontSize: 26, color: box && !box.aWin ? 'rgb(var(--accent-2))' : 'rgb(var(--ink))', cursor: 'help' }}>{bName}</span></TeamHover>
                : <span className="title-xl" style={{ fontSize: 26, color: 'rgb(var(--faint))' }}>{bName}</span>}
              <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 4 }}>{match.teamB ? 'B 方 · 红色方' : '晋级待定'}</div>
            </div>
          </div>
        </div>

        {!finished && (
          <div style={{ padding: '0 18px 22px' }}>
            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
              <div className="kicker" style={{ marginBottom: 8 }}>对局尚未开始</div>
              <div className="readout" style={{ fontSize: 13, color: 'rgb(var(--ink))' }}>预定开赛 · {_fmtDate(match.scheduledAt)}</div>
              {known && <div className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))', marginTop: 6 }}>悬停两队名查看阵容与战绩</div>}
            </div>
          </div>
        )}

        {box && (
          <div style={{ padding: '0 18px 24px', display: 'grid', gap: 18 }}>
            {/* team compare */}
            <div className="panel" style={{ padding: '16px 18px' }}>
              <div className="kicker" style={{ marginBottom: 14 }}>团队数据对比</div>
              <CompareBar label="击杀" a={box.A.kills} b={box.B.kills} />
              <CompareBar label="经济 (K)" a={Math.round(box.A.gold / 1000)} b={Math.round(box.B.gold / 1000)} />
              <CompareBar label="推塔" a={box.A.towers} b={box.B.towers} />
              <CompareBar label="小龙" a={box.A.drakes} b={box.B.drakes} />
              <CompareBar label="男爵" a={box.A.barons} b={box.B.barons} />
            </div>

            {/* lineups */}
            <div className="panel">
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgb(var(--line))', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="dot" style={{ background: 'rgb(var(--accent))' }}></span>
                <span className="label" style={{ color: box.aWin ? 'rgb(var(--accent))' : 'rgb(var(--ink))' }}>{aName}</span>
                {box.aWin && <span className="chip ac" style={{ marginLeft: 'auto' }}>胜</span>}
              </div>
              <LineupTable side={box.A} mvpId={box.mvp.id} />
            </div>
            <div className="panel">
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgb(var(--line))', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="dot" style={{ background: 'rgb(var(--accent-2))' }}></span>
                <span className="label" style={{ color: !box.aWin ? 'rgb(var(--accent-2))' : 'rgb(var(--ink))' }}>{bName}</span>
                {!box.aWin && <span className="chip ac" style={{ marginLeft: 'auto' }}>胜</span>}
              </div>
              <LineupTable side={box.B} mvpId={box.mvp.id} />
            </div>

            {/* events */}
            <div className="panel">
              <div style={{ padding: '11px 16px', borderBottom: '1px solid rgb(var(--line))' }}><span className="label">关键事件</span></div>
              <div style={{ padding: '6px 0' }}>
                {box.events.map((e, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px auto 1fr', alignItems: 'center', gap: 11, padding: '9px 16px', borderBottom: i === box.events.length - 1 ? 'none' : '1px solid rgb(var(--line) / 0.35)' }}>
                    <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{e.t}</span>
                    <span className="chip" style={{ borderColor: `rgb(${evColor[e.kind] || '--accent'} / 0.55)`, color: `rgb(${evColor[e.kind] || '--accent'})` }}>{e.tag}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))' }}>{e.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>, document.body);
}

Object.assign(window, { MatchDetail, buildMatch });
