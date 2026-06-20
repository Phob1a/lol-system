/* NEXUS — app shell. Header status bar + left nav rail + style switch + router.
   Sections: overview / matches / players / draft / signup. */
const { useState: uSA, useEffect: uEA } = React;

const NAV = [
  { key: 'overview', glyph: '◎', label: '观测总览', sub: 'OBSERVATORY' },
  { key: 'matches', glyph: '⊞', label: '赛事中心', sub: 'MATCHES' },
  { key: 'players', glyph: '✦', label: '选手目录', sub: 'PLAYERS' },
  { key: 'draft', glyph: '◇', label: '选秀控制台', sub: 'DRAFT · LIVE' },
  { key: 'signup', glyph: '+', label: '报名注册', sub: 'ENLIST' },
  { key: 'data', glyph: '◫', label: '数据中心', sub: 'DATA' },
];

const SCREENS = {
  overview: () => <OverviewScreen />,
  matches: () => <MatchesScreen />,
  players: () => <PlayersScreen />,
  draft: () => <DraftScreen />,
  signup: () => <SignupScreen />,
};

function Clock() {
  const [t, setT] = uSA(new Date());
  uEA(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n) => ('0' + n).slice(-2);
  return <span className="readout" style={{ fontSize: 13, color: 'rgb(var(--accent))', letterSpacing: 1 }}>{p(t.getHours())}:{p(t.getMinutes())}:{p(t.getSeconds())}</span>;
}

function StyleSwitch({ value, onChange }) {
  return (
    <div className="styleswitch">
      {[['celestial', 'CELESTIAL'], ['command', 'COMMAND']].map(([k, l]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

function App() {
  const [mode, setMode] = uSA(() => { try { return localStorage.getItem('nexus.mode') || 'ops'; } catch (e) { return 'ops'; } });
  const [route, setRoute] = uSA(() => {
    let m = 'ops'; try { m = localStorage.getItem('nexus.mode') || 'ops'; } catch (e) {}
    const navList = m === 'admin' ? ADMIN_NAV : NAV;
    let r = null; try { r = localStorage.getItem('nexus.route.' + m); } catch (e) {}
    const keys = navList.map(n => n.key);
    return keys.indexOf(r) >= 0 ? r : navList[0].key;
  });
  const [style, setStyle] = uSA(() => { try { return localStorage.getItem('nexus.style') || 'command'; } catch (e) { return 'command'; } });
  const [selTeam, setSelTeam] = uSA(null);
  const [appMatch, setAppMatch] = uSA(null);
  const teamFrom = React.useRef('data');
  function openTeam(id) { teamFrom.current = (route === 'team' ? teamFrom.current : route); setSelTeam(id); setRoute('team'); }
  uEA(() => { window.__nexusGoTeam = openTeam; window.__nexusOpenMatch = setAppMatch; }, [route]);

  uEA(() => { try { localStorage.setItem('nexus.route.' + mode, route); } catch (e) {} }, [route, mode]);
  function changeStyle(s) {
    setStyle(s);
    window.OPS_THEME.apply(s);
    try { localStorage.setItem('nexus.style', s); } catch (e) {}
    // re-tint starfield after CSS vars settle
    requestAnimationFrame(() => { if (window.NEXUS_STARS) window.NEXUS_STARS.refreshColors(); });
  }

  function changeMode(m) {
    setMode(m);
    try { localStorage.setItem('nexus.mode', m); } catch (e) {}
    const navList = m === 'admin' ? ADMIN_NAV : NAV;
    let r = null; try { r = localStorage.getItem('nexus.route.' + m); } catch (e) {}
    const keys = navList.map(n => n.key);
    setRoute(keys.indexOf(r) >= 0 ? r : navList[0].key);
  }

  const NAV_LIST = mode === 'admin' ? ADMIN_NAV : NAV;
  const ADMIN_SCREENS = {
    aoverview: () => <AdminOverview go={setRoute} />,
    reg: () => <AdminRegistrations />,
    teams: () => <AdminTeams />,
    control: () => <AdminControl />,
    audit: () => <AdminAudit />,
  };
  const SCR = mode === 'admin' ? ADMIN_SCREENS : SCREENS;
  let ScreenEl;
  if (mode === 'admin') ScreenEl = (ADMIN_SCREENS[route] || ADMIN_SCREENS.aoverview)();
  else if (route === 'team') ScreenEl = <TeamPage teamId={selTeam || NAV && D.teams[0].id} onBack={() => setRoute(teamFrom.current || 'matches')} onOpenMatch={setAppMatch} />;
  else if (route === 'data') ScreenEl = <DataCenter onOpenTeam={openTeam} onOpenMatch={setAppMatch} />;
  else ScreenEl = (SCREENS[route] || SCREENS.overview)();
  const styleLabel = style === 'celestial' ? 'CELESTIAL CONSOLE' : 'PERSONAL COMMAND DECK';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* status bar */}
      <div className="statbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.06em', color: 'rgb(var(--accent))', textShadow: '0 0 16px rgb(var(--accent) / 0.6)' }}>◢ NEXUS</span>
          <div className="styleswitch">
            {[['ops', '公开端'], ['admin', '管理后台']].map(([k, l]) => (
              <button key={k} className={mode === k ? 'on' : ''} onClick={() => changeMode(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="statbar-center" style={{ display: 'flex', justifyContent: 'center', gap: 18, alignItems: 'center' }}>
          <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--dim))', display: 'flex', alignItems: 'center', gap: 7 }}><span className="live-dot"></span>ORACLE LINK STABLE</span>
          <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>· NIGHT 05 OF 14 ·</span>
          <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--dim))' }}>{D.tournament.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="kicker" style={{ fontSize: 8.5 }}>OPERATOR</div>
            <div className="readout" style={{ fontSize: 12, color: 'rgb(var(--ink))' }}>DAI · 代立轩</div>
          </div>
          <Clock />
          <StyleSwitch value={style} onChange={changeStyle} />
        </div>
      </div>

      {/* body */}
      <div className="app-body" style={{ flex: 1, display: 'grid', gridTemplateColumns: '232px 1fr', alignItems: 'start' }}>
        {/* nav rail */}
        <div style={{ borderRight: '1px solid rgb(var(--line))', background: 'rgb(var(--surface) / 0.5)', position: 'sticky', top: 54, alignSelf: 'start', minHeight: 'calc(100vh - 54px)' }}>
          <div style={{ padding: '16px 14px 12px' }}>
            <div className="kicker">{mode === 'admin' ? 'PANEL · OPS' : 'PANEL · NAV'}</div>
            <div className="title-xl" style={{ fontSize: 18, color: 'rgb(var(--ink))', marginTop: 4 }}>{mode === 'admin' ? '运维后台' : '控制面板'}</div>
          </div>
          {NAV_LIST.map(n => (
            <button key={n.key} className={'navitem' + (route === n.key ? ' on' : '')} onClick={() => setRoute(n.key)}>
              <span className="nav-glyph" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14 }}>{n.glyph}</span>
              <span>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500 }}>{n.label}</span>
                <span className="readout" style={{ fontSize: 9, color: 'rgb(var(--faint))', letterSpacing: 1 }}>{n.sub}</span>
              </span>
              {(n.key === 'draft' || n.key === 'control') && <span className="live-dot"></span>}
            </button>
          ))}
          <div style={{ padding: 16 }}>
            <div className="glow-rule" style={{ marginBottom: 16 }}></div>
            <div className="kicker" style={{ marginBottom: 10 }}>ALMANAC · 5 / 14</div>
            <MoonPhase total={14} current={5} size={15} />
          </div>
          <div style={{ padding: '4px 16px 20px' }}>
            <div className="panel" style={{ padding: 12 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>LINK · STABLE</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Sparkline data={[3, 4, 3, 5, 6, 5, 7, 8]} w={90} h={22} color="rgb(var(--good))" dot />
                <span className="readout" style={{ fontSize: 13, color: 'rgb(var(--good))', fontWeight: 700 }}>8.2</span>
              </div>
            </div>
          </div>
        </div>

        {/* main */}
        <div key={mode + route + style} style={{ minWidth: 0 }}>
          {ScreenEl}
        </div>
      </div>
      {appMatch && <MatchDetail match={appMatch} onClose={() => setAppMatch(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('ops-root')).render(<App />);
