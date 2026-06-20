/* NEXUS — LoL screens. Celestial / Command styles both driven by CSS vars.
   Exports: OverviewScreen, MatchesScreen, PlayersScreen, DraftScreen, SignupScreen + shared bits. */
const D = window.LOL_DATA;
const { useState, useMemo } = React;

/* ---------- shared bits ---------- */
function Kicker({ children, style }) { return <div className="kicker" style={style}>{children}</div>; }
function SerifI({ children, style }) { return <span className="serif-i" style={style}>{children}</span>; }

function PanelHead({ idx, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgb(var(--line))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {idx && <span className="readout" style={{ color: 'rgb(var(--accent))', fontSize: 11 }}>◇ {idx}</span>}
        <span className="label" style={{ color: 'rgb(var(--ink))', letterSpacing: '0.16em' }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

function DTile({ label, value, sub, ico }) {
  return (
    <div className="dtile">
      <div className="kicker" style={{ marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span className="v readout">{value}</span>
        {ico}
      </div>
      {sub && <div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const teamColor = (i) => i % 2 === 0 ? 'rgb(var(--accent))' : 'rgb(var(--accent-2))';

/* =====================================================================
   OVERVIEW — tournament observatory
   ===================================================================== */
function OverviewScreen() {
  const t = D.tournament, ov = D.overview;
  const topPlayers = D.profiles.slice(0, 6);
  // bracket as orbiting bodies around the tournament core
  const bodies = D.teams.map((tm, i) => ({
    label: tm.name.slice(0, 2), id: tm.id, r: 0.55 + (i % 4) * 0.15, a: (i * 47) % 360, on: i < 4,
  }));
  const finishedFrac = ov.finishedCount / ov.matchCount;
  const trajPts = [3, 4, 4, 5, 6, 5, 7, 8, 7, 9, 8, 10, 9, 11];

  return (
    <div className="fade-in scr-2col" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, padding: 22, alignItems: 'start' }}>
      {/* left column */}
      <div style={{ display: 'grid', gap: 18 }}>
        {/* hero */}
        <div className="panel glow" style={{ padding: 22, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 26, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Kicker style={{ marginBottom: 6 }}>赛程 · 阶段</Kicker>
            <div className="serial">05</div>
            <div className="serif-i" style={{ color: 'rgb(var(--dim))', fontSize: 15, marginTop: 4 }}>of fourteen</div>
            <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 8 }}>STREAK · ×0</div>
          </div>
          <div>
            <Kicker style={{ marginBottom: 8 }}>当前赛事</Kicker>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 30, lineHeight: 1.08, color: 'rgb(var(--ink))', marginBottom: 4 }}>{t.name}</div>
            <div className="title-xl" style={{ fontSize: 22, color: 'rgb(var(--accent))' }}>GROUP STAGE · 小组赛</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="chip ac">{t.kind}</span>
              <span className="chip">{t.config.template}</span>
              <span className="chip">预算 {t.teamBudget} CR</span>
              <span className="chip good"><span className="dot" style={{ background: 'rgb(var(--good))' }}></span>ORACLE LINK STABLE</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="kicker">赛程进度 · {ov.finishedCount}/{ov.matchCount}</span>
                <span className="readout accent-t" style={{ fontSize: 11 }}>{Math.round(finishedFrac * 100)}%</span>
              </div>
              <SegBudget used={ov.finishedCount} total={ov.matchCount} segs={28} />
            </div>
          </div>
        </div>

        {/* data tiles */}
        <div className="quad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <DTile label="报名人数" value={ov.registrationCount} sub={'队长意向 ' + ov.captainIntentionCount} />
          <DTile label="参赛队伍" value={ov.teamCount} sub="2 组 × 4" />
          <DTile label="赛程场次" value={ov.matchCount} sub={ov.finishedCount + ' 已结束'} />
          <DTile label="选秀状态" value={<span className="hot-t">LIVE</span>} ico={<span className="live-dot"></span>} sub="第 4 轮进行中" />
        </div>

        {/* trajectory */}
        <div className="panel">
          <PanelHead idx="TRAJ-14" title="赛程轨迹 · 14 夜" right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>ALTITUDE PROFILE</span>} />
          <div style={{ padding: 18 }}>
            <TrajectoryLine points={trajPts} current={4} labels={trajPts.map((_, i) => 'D' + String(i + 1).padStart(2, '0'))} w={900} h={96} />
          </div>
        </div>

        {/* today fixtures */}
        <TodayTimeline onOpenMatch={(m) => window.__nexusOpenMatch && window.__nexusOpenMatch(m)} />

        {/* standings */}
        <div className="twin" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {D.standings.map((s, i) => (
            <div key={i} className="panel">
              <PanelHead idx={'GRP-' + (i + 1)} title={s.name + ' · 积分'} />
              <div style={{ padding: 16 }}><GroupBars rows={s.rows} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* right column */}
      <div style={{ display: 'grid', gap: 18 }}>
        {/* orrery */}
        <div className="panel scan" style={{ position: 'relative' }}>
          <PanelHead idx="ORRERY" title="赛事星图 · 8 队" right={<span className="chip ac">观测中</span>} />
          <div style={{ padding: 18 }}>
            <Orrery center="NEXUS" bodies={bodies} size={300} onBody={(id) => window.__nexusGoTeam && window.__nexusGoTeam(id)} />
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}><div className="kicker">轨道</div><div className="readout" style={{ fontSize: 20, color: 'rgb(var(--ink))' }}>2</div></div>
              <div style={{ textAlign: 'center' }}><div className="kicker">天体</div><div className="readout" style={{ fontSize: 20, color: 'rgb(var(--ink))' }}>8</div></div>
              <div style={{ textAlign: 'center' }}><div className="kicker">晋级</div><div className="readout accent-t" style={{ fontSize: 20 }}>4</div></div>
            </div>
          </div>
        </div>

        {/* top teams compare */}
        <TopTeamsCompare />

        {/* top players */}
        <div className="panel">
          <PanelHead idx="LEAD-01" title="选手榜 · KDA 前六" />
          <div>
            {topPlayers.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'center', gap: 11, padding: '10px 16px', borderBottom: '1px solid rgb(var(--line) / 0.4)' }}>
                <span className="readout" style={{ fontSize: 13, color: i < 3 ? 'rgb(var(--accent))' : 'rgb(var(--faint))', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ minWidth: 0 }}>
                  <PlayerHover playerId={p.playerId}><div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgb(var(--ink))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help', width: 'fit-content', maxWidth: '100%' }}>{p.nickname}</div></PlayerHover>
                  <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{p.teamName} · {p.primaryPosition}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkline data={p.recentForm.map(w => w ? 1 : 0)} w={56} h={20} color="rgb(var(--accent))" dot />
                  <span className="readout accent-t" style={{ fontSize: 15, fontWeight: 700 }}>{p.summary.kda}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* mvp board */}
        <MvpStrip />
      </div>
    </div>
  );
}

/* =====================================================================
   MATCHES — schedule + standings + bracket
   ===================================================================== */
function MatchesScreen() {
  const [tab, setTab] = useState('schedule');
  const [selMatch, setSelMatch] = useState(null);
  const [grpF, setGrpF] = useState('ALL');
  const [statF, setStatF] = useState('ALL');
  const fmt = (iso) => { const d = new Date(iso); return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  const nextMatch = D.matches.filter(m => m.status === 'SCHEDULED').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid rgb(var(--line))', paddingLeft: 4 }}>
        {[['schedule', 'i. 赛程'], ['standings', 'ii. 积分榜'], ['bracket', 'iii. 对阵图']].map(([k, l]) => (
          <button key={k} className={'tabbtn' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'schedule' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {nextMatch && (
            <div className="panel glow hot-edge" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <Kicker style={{ marginBottom: 5 }}>下一场 · NEXT FIXTURE</Kicker>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'rgb(var(--ink))' }}>{nextMatch.teamA ? nextMatch.teamA.name : '待定'} <span style={{ color: 'rgb(var(--faint))', margin: '0 6px' }}>vs</span> {nextMatch.teamB ? nextMatch.teamB.name : '待定'} · {nextMatch.label}</div>
              </div>
              <Countdown to={nextMatch.scheduledAt} label="距开赛" />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['ALL', '全部'], ['A', 'A 组'], ['B', 'B 组'], ['KO', '淘汰赛']].map(([k, l]) => <button key={k} className={'chip' + (grpF === k ? ' ac' : '')} style={{ cursor: 'pointer' }} onClick={() => setGrpF(k)}>{l}</button>)}
            </div>
            <div style={{ width: 1, height: 16, background: 'rgb(var(--line))' }}></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['ALL', '全部'], ['SCHEDULED', '未开始'], ['FINISHED', '已结束']].map(([k, l]) => <button key={k} className={'chip' + (statF === k ? ' ac' : '')} style={{ cursor: 'pointer' }} onClick={() => setStatF(k)}>{l}</button>)}
            </div>
          </div>
          {[['A组 小组赛', 'RR-1', 'A'], ['B组 小组赛', 'RR-2', 'B'], [null, 'KO', 'KO']].filter(([, , key]) => grpF === 'ALL' || grpF === key).map(([grp, idx, key]) => {
            const ms = D.matches.filter(m => (grp ? m.label === grp : !m.group)).filter(m => statF === 'ALL' || m.status === statF);
            if (!ms.length) return null;
            return (
              <div key={key} className="panel">
                <PanelHead idx={idx} title={grp || '淘汰赛 · 半决赛 / 总决赛'} right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{ms.length} 场</span>} />
                <div>
                  {ms.map((m) => {
                    const aWin = m.winnerTeamId && m.teamA && m.winnerTeamId === m.teamA.id;
                    const bWin = m.winnerTeamId && m.teamB && m.winnerTeamId === m.teamB.id;
                    return (
                      <div key={m.id} className="matchrow clickable" onClick={() => setSelMatch(m)}>
                        <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{fmt(m.scheduledAt)}</span>
                        <span style={{ textAlign: 'right' }}>
                          {m.teamA
                            ? <TeamHover teamId={m.teamA.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: aWin ? 'rgb(var(--accent))' : 'rgb(var(--ink))', fontWeight: aWin ? 700 : 400, cursor: 'help' }}>{m.teamA.name}</span></TeamHover>
                            : <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--faint))' }}>待定</span>}
                        </span>
                        <span style={{ textAlign: 'center' }}>
                          {m.status === 'FINISHED'
                            ? <span className="readout" style={{ fontSize: 14, color: 'rgb(var(--ink))', fontWeight: 700, letterSpacing: 1 }}>{aWin ? '1' : '0'} : {bWin ? '1' : '0'}</span>
                            : <span className="chip" style={{ borderColor: 'rgb(var(--line))' }}>BO{m.bestOf}</span>}
                        </span>
                        <span>
                          {m.teamB
                            ? <TeamHover teamId={m.teamB.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: bWin ? 'rgb(var(--accent))' : 'rgb(var(--ink))', fontWeight: bWin ? 700 : 400, cursor: 'help' }}>{m.teamB.name}</span></TeamHover>
                            : <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--faint))' }}>待定</span>}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          {m.status === 'FINISHED'
                            ? <span className="chip good">已结束</span>
                            : <span className="chip ac">未开始</span>}
                          <span className="row-go readout" style={{ fontSize: 13 }}>▸</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'standings' && (
        <div className="twin" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {D.standings.map((s, i) => (
            <div key={i} className="panel">
              <PanelHead idx={'GRP-' + (i + 1)} title={s.name} />
              <table className="ops-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['#', '队伍', '胜', '负', '积分'].map((h, k) => <th key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: k > 1 ? 'center' : 'left', padding: '9px 14px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {s.rows.map((r, k) => (
                    <tr key={k} style={{ background: k < 2 ? 'rgb(var(--accent) / 0.06)' : 'transparent' }}>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)' }}><span className="readout accent-t" style={{ fontWeight: 700 }}>{r.rank}</span></td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgb(var(--ink))' }}><TeamHover teamId={r.teamId}><span style={{ cursor: 'pointer' }} onClick={() => window.__nexusGoTeam && window.__nexusGoTeam(r.teamId)}>{r.name}</span></TeamHover></td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }} className="readout">{r.wins}</td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }} className="readout">{r.losses}</td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }}><span className="readout" style={{ fontWeight: 700, color: 'rgb(var(--ink))' }}>{r.points}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === 'bracket' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="panel scan">
            <PanelHead idx="BRACKET" title="晋级星图 · 小组赛 → 淘汰赛" />
            <div style={{ padding: 20 }}><BracketMap standings={D.standings} w={760} h={300} /></div>
          </div>
          <div className="panel">
            <PanelHead idx="KO-TREE" title="淘汰赛对阵树" right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>点击查看单场</span>} />
            <KoTree onOpenMatch={setSelMatch} />
          </div>
        </div>
      )}

      {selMatch && <MatchDetail match={selMatch} onClose={() => setSelMatch(null)} />}
    </div>
  );
}

Object.assign(window, { Kicker, SerifI, PanelHead, DTile, teamColor, OverviewScreen, MatchesScreen });
