/* NEXUS — operator back-office (管理后台). Five interactive screens that reuse the
   shared component classes + charts + hover cards. Exports Admin* screens + ADMIN_NAV. */
const DA = window.LOL_DATA;
const { useState: aS, useMemo: aM } = React;

/* ---- synthesize a fuller audit trail from the mock data (deterministic) ---- */
function buildAudit() {
  const out = [];
  let n = 1;
  const push = (action, entity, user, payload, t) => out.push({ id: n++, action, entity, user, payload, t });
  push('MATCH_FINISHED', 'Match', 'system', DA.standings[0].rows[0].name + ' 取胜小组赛', '06-15 21:14');
  DA.draft.events.slice(0, 4).forEach((e, i) => push(e.type, e.type.indexOf('ROUND') >= 0 ? 'DraftRound' : 'DraftPick', e.actor === '系统' ? 'system' : (e.actor === '管理员' ? 'admin' : 'captain_' + e.actor), e.text, '06-14 ' + e.t));
  push('ROUND_STARTED', 'DraftRound', 'admin', '第 4 轮开始 · 模式 REVERSE_LAST', '06-14 14:30');
  push('TOURNAMENT_STATUS', 'Tournament', 'admin', 'DRAFT → GROUP_STAGE', '06-14 13:55');
  DA.teams.slice(0, 3).forEach((tm, i) => push('REGISTRATION_APPROVED', 'Registration', 'admin', '通过 ' + tm.captainNickname + ' 的队长报名', '06-13 1' + (2 - i) + ':0' + (i + 1)));
  push('REGISTRATION_EXCLUDED', 'Registration', 'admin', '排除重复报名 Player#204', '06-13 10:02');
  push('TOURNAMENT_STATUS', 'Tournament', 'admin', 'ROSTER_LOCKED → DRAFT', '06-13 09:40');
  push('TOURNAMENT_STATUS', 'Tournament', 'admin', 'REGISTRATION → ROSTER_LOCKED', '06-12 23:50');
  DA.teams.slice(0, 4).forEach((tm) => push('TEAM_CREATED', 'Team', 'admin', '创建队伍账号 ' + tm.name, '06-12 22:1' + (DA.teams.indexOf(tm))));
  for (let i = 0; i < 6; i++) push('REGISTRATION_SUBMITTED', 'Registration', 'player', DA.players[i].nickname + ' 提交报名 · ' + DA.POS_LABEL[DA.players[i].primaryPositions[0]], '06-1' + (1 - (i > 2 ? 1 : 0)) + ' 1' + (8 - i) + ':2' + i);
  return out;
}
const AUDIT = buildAudit();

const ACT_TONE = {
  REGISTRATION_APPROVED: 'good', MATCH_FINISHED: 'good', PICK_MADE: 'ac',
  DRAFT_PICK: 'ac', REGISTRATION_EXCLUDED: 'bad', PICK_REVOKED: 'bad',
  ROUND_STARTED: 'a2', TOURNAMENT_STATUS: 'a2', TEAM_CREATED: 'dim', REGISTRATION_SUBMITTED: 'dim',
};
function toneStyle(tone) {
  if (tone === 'good') return { borderColor: 'rgb(var(--good) / 0.55)', color: 'rgb(var(--good))' };
  if (tone === 'bad') return { borderColor: 'rgb(var(--bad) / 0.55)', color: 'rgb(var(--bad))' };
  if (tone === 'ac') return { borderColor: 'rgb(var(--accent) / 0.6)', color: 'rgb(var(--accent))' };
  if (tone === 'a2') return { borderColor: 'rgb(var(--accent-2) / 0.6)', color: 'rgb(var(--accent-2))' };
  return { borderColor: 'rgb(var(--line))', color: 'rgb(var(--dim))' };
}

/* small KPI tile with sparkline */
function KPI({ label, value, sub, spark, tone }) {
  return (
    <div className="dtile">
      <div className="kicker" style={{ marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span className="v readout" style={tone ? { color: 'rgb(var(--' + tone + '))' } : null}>{value}</span>
        {spark && <Sparkline data={spark} w={70} h={22} color={tone ? 'rgb(var(--' + tone + '))' : 'rgb(var(--accent))'} dot />}
      </div>
      {sub && <div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/* =====================================================================
   ADMIN OVERVIEW — control deck
   ===================================================================== */
function AdminOverview({ go }) {
  const ov = DA.overview;
  const pending = 6, approved = ov.registrationCount - 8, excluded = 2;
  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 18 }}>
      <div className="panel glow" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Kicker style={{ marginBottom: 6 }}>OPS CONTROL · 运维控制台</Kicker>
          <div className="title-xl" style={{ fontSize: 26, color: 'rgb(var(--ink))' }}>{DA.tournament.name} · 运维概览</div>
          <div className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))', marginTop: 6 }}>状态 GROUP_STAGE · 选秀 LIVE · 数据链路稳定</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => go('reg')}>报名审核</button>
          <button className="btn btn-primary" onClick={() => go('control')}>赛事控制</button>
        </div>
      </div>

      <div className="quad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI label="总报名" value={ov.registrationCount} sub={'队长意向 ' + ov.captainIntentionCount} spark={[12, 18, 24, 30, 38, 44, 46]} />
        <KPI label="待审核" value={pending} sub="需要处理" spark={[2, 5, 8, 6, 9, 7, 6]} tone="accent" />
        <KPI label="已通过" value={approved} sub="进入选手池" spark={[4, 10, 18, 26, 33, 36, 38]} tone="good" />
        <KPI label="已排除" value={excluded} sub="重复 / 违规" spark={[0, 1, 1, 2, 2, 2, 2]} tone="bad" />
      </div>

      <div className="scr-2col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
        <div className="panel">
          <PanelHead idx="FUNNEL" title="报名漏斗 · 转化" right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>SUBMIT → ROSTER</span>} />
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>
            {[['提交报名', ov.registrationCount, 'accent'], ['通过审核', approved, 'good'], ['进入选秀池', 46, 'accent-2'], ['已被选秀', 40, 'gold'], ['锁定首发', 40, 'good']].map((r, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="label">{r[0]}</span>
                  <span className="readout" style={{ fontSize: 12, color: 'rgb(var(--' + r[2] + '))', fontWeight: 700 }}>{r[1]}</span>
                </div>
                <div style={{ height: 8, background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--line))', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: (r[1] / ov.registrationCount * 100) + '%', background: 'rgb(var(--' + r[2] + ') / 0.8)' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel scan">
          <PanelHead idx="AUDIT" title="近期操作流" right={<span className="live-dot"></span>} />
          <div style={{ padding: '6px 0', maxHeight: 320, overflow: 'auto' }}>
            {AUDIT.slice(0, 8).map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, padding: '9px 16px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}>
                <span className="chip" style={{ ...toneStyle(ACT_TONE[e.action]), marginTop: 1 }}>{e.action.replace(/_/g, ' ')}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))', lineHeight: 1.35 }}>{e.payload}</div>
                  <div className="readout" style={{ fontSize: 9.5, color: 'rgb(var(--faint))', marginTop: 2 }}>{e.user} · {e.t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   ADMIN REGISTRATIONS — review queue
   ===================================================================== */
function AdminRegistrations() {
  const init = aM(() => {
    const m = {};
    DA.players.forEach((p, i) => { m[p.id] = p.teamId ? 'APPROVED' : (i % 9 === 4 ? 'EXCLUDED' : 'PENDING'); });
    return m;
  }, []);
  const [status, setStatus] = aS(init);
  const [tab, setTab] = aS('PENDING');
  const [q, setQ] = aS('');
  const set = (id, s) => setStatus(prev => ({ ...prev, [id]: s }));

  const counts = aM(() => {
    const c = { ALL: DA.players.length, PENDING: 0, APPROVED: 0, EXCLUDED: 0, CAPTAIN: 0 };
    DA.players.forEach(p => { c[status[p.id]]++; if (p.willingToCaptain) c.CAPTAIN++; });
    return c;
  }, [status]);

  const rows = DA.players.filter(p => {
    if (tab === 'CAPTAIN' ? !p.willingToCaptain : (tab !== 'ALL' && status[p.id] !== tab)) return false;
    if (q && (p.nickname + p.gameId).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
    return true;
  });
  const TABS = [['PENDING', '待审', counts.PENDING], ['APPROVED', '已通过', counts.APPROVED], ['EXCLUDED', '已排除', counts.EXCLUDED], ['CAPTAIN', '队长意向', counts.CAPTAIN], ['ALL', '全部', counts.ALL]];
  const stStyle = (s) => s === 'APPROVED' ? toneStyle('good') : s === 'EXCLUDED' ? toneStyle('bad') : toneStyle('ac');
  const stLabel = (s) => s === 'APPROVED' ? '已通过' : s === 'EXCLUDED' ? '已排除' : '待审';

  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TABS.map(([k, l, c]) => (
            <button key={k} className={'btn btn-sm' + (tab === k ? ' btn-primary' : '')} onClick={() => setTab(k)} style={{ gap: 7 }}>
              {l}<span className="readout" style={{ fontSize: 10, opacity: 0.8 }}>{c}</span>
            </button>
          ))}
        </div>
        <input className="field" style={{ width: 220, height: 34 }} placeholder="搜索昵称 / ID…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="panel">
        <PanelHead idx="QUEUE" title={'报名审核队列 · ' + rows.length} right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{counts.PENDING} 待处理</span>} />
        <div style={{ maxHeight: 560, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgb(var(--panel))', zIndex: 1 }}>
              <tr>{['选手', '位置', '段位', '身价', '队长', '状态', '操作'].map((h, i) => <th key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: i > 2 && i < 6 ? 'center' : 'left', padding: '10px 14px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = status[p.id];
                return (
                  <tr key={p.id} className="row-hover">
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <PosPip pos={p.primaryPositions[0]} size={24} />
                        <div style={{ minWidth: 0 }}>
                          {p.teamId
                            ? <PlayerHover playerId={p.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))', cursor: 'help' }}>{p.nickname}</span></PlayerHover>
                            : <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))' }}>{p.nickname}</span>}
                          <div className="readout" style={{ fontSize: 9.5, color: 'rgb(var(--faint))' }}>{p.gameId}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }} className="readout"><span style={{ fontSize: 12, color: 'rgb(var(--dim))' }}>{DA.POS_LABEL[p.primaryPositions[0]]}</span></td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', fontSize: 12, color: 'rgb(var(--dim))' }}>{p.currentRank}</td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }} className="readout accent-t">{p.cost}</td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }}>{p.willingToCaptain ? <span className="chip ac">意向</span> : <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>—</span>}</td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', textAlign: 'center' }}><span className="chip" style={stStyle(s)}>{stLabel(s)}</span></td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {s !== 'APPROVED' && <button className="btn btn-sm" style={{ borderColor: 'rgb(var(--good) / 0.5)', color: 'rgb(var(--good))' }} onClick={() => set(p.id, 'APPROVED')}>通过</button>}
                        {s !== 'EXCLUDED' && <button className="btn btn-sm" style={{ borderColor: 'rgb(var(--bad) / 0.45)', color: 'rgb(var(--bad))' }} onClick={() => set(p.id, 'EXCLUDED')}>排除</button>}
                        {s !== 'PENDING' && <button className="btn btn-sm" onClick={() => set(p.id, 'PENDING')}>撤回</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="readout" style={{ padding: 28, textAlign: 'center', color: 'rgb(var(--faint))' }}>无匹配记录</div>}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   ADMIN TEAMS — roster management
   ===================================================================== */
function AdminTeams() {
  const [open, setOpen] = aS(DA.teams[0].id);
  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 16 }}>
      <div className="quad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KPI label="队伍" value={DA.teams.length} sub="2 组 × 4" />
        <KPI label="平均预算余" value={Math.round(DA.teams.reduce((a, t) => a + t.budgetLeft, 0) / DA.teams.length)} sub="CR" tone="accent" />
        <KPI label="满员队伍" value={DA.teams.filter(t => t.slots.every(s => s.registration)).length} sub="5 / 5 首发" tone="good" />
        <KPI label="队长" value={DA.teams.length} sub="已绑定" />
      </div>

      <div className="twin" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {DA.teams.map((tm, ti) => {
          const filled = tm.slots.filter(s => s.registration).length;
          const isOpen = open === tm.id;
          return (
            <div key={tm.id} className={'panel' + (isOpen ? ' glow' : '')}>
              <button onClick={() => setOpen(isOpen ? null : tm.id)} style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <TeamHover teamId={tm.id}><span className="title-xl" style={{ fontSize: 19, color: 'rgb(var(--ink))', cursor: 'help' }}>{tm.name}</span></TeamHover>
                    <span className="chip">{tm.group} 组</span>
                  </div>
                  <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 3 }}>队长 {tm.captainNickname} · {filled}/5 首发</div>
                </div>
                <span className="readout" style={{ fontSize: 16, color: 'rgb(var(--accent))', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
              </button>
              <div style={{ padding: '0 16px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="kicker">预算余额</span>
                  <span className="readout accent-t" style={{ fontSize: 11 }}>{tm.budgetLeft} / {DA.tournament.teamBudget} CR</span>
                </div>
                <SegBudget used={tm.budgetLeft} total={DA.tournament.teamBudget} segs={22} />
                {isOpen && (
                  <div style={{ marginTop: 14, display: 'grid', gap: 7 }}>
                    {tm.slots.map((sl, si) => (
                      <div key={si} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--line))' }}>
                        <PosPip pos={sl.position} on={!!sl.registration} size={24} />
                        {sl.registration
                          ? <PlayerHover playerId={sl.registration.id}><span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))', cursor: 'help' }}>{sl.registration.nickname}{sl.registration.isCaptain && <span style={{ color: 'rgb(var(--gold))', marginLeft: 5, fontSize: 11 }}>★队长</span>}</span></PlayerHover>
                          : <span className="readout" style={{ fontSize: 12, color: 'rgb(var(--faint))' }}>空缺</span>}
                        <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--dim))' }}>{sl.registration ? sl.registration.cost + ' CR' : '—'}</span>
                        <button className="btn btn-sm">{sl.registration ? '调整' : '指派'}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================================
   ADMIN CONTROL — tournament status machine + draft controls
   ===================================================================== */
const STAGES = [
  { k: 'REGISTRATION', l: '报名开放' }, { k: 'ROSTER_LOCKED', l: '名单锁定' }, { k: 'DRAFT', l: '选秀进行' },
  { k: 'GROUP_STAGE', l: '小组赛' }, { k: 'KNOCKOUT', l: '淘汰赛' }, { k: 'FINISHED', l: '赛事结束' },
];
function AdminControl() {
  const [stage, setStage] = aS(3); // GROUP_STAGE
  const [round, setRound] = aS(4);
  const [mode, setMode] = aS('REVERSE_LAST');
  const [paused, setPaused] = aS(false);
  const [log, setLog] = aS([{ t: '14:32', x: '第 4 轮 · 暗影军团 选择 影刃' }]);
  const addLog = (x) => setLog(l => [{ t: new Date().toTimeString().slice(0, 5), x }, ...l].slice(0, 8));

  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 18 }}>
      {/* status machine */}
      <div className="panel">
        <PanelHead idx="STATE" title="赛事状态机" right={<span className="chip ac">{STAGES[stage].k}</span>} />
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            {STAGES.map((s, i) => (
              <React.Fragment key={s.k}>
                <div style={{ textAlign: 'center', flex: 'none', width: 92 }}>
                  <div style={{ width: 34, height: 34, margin: '0 auto 8px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid ' + (i <= stage ? 'rgb(var(--accent))' : 'rgb(var(--line))'), background: i < stage ? 'rgb(var(--accent))' : 'transparent', color: i < stage ? 'rgb(var(--bg))' : (i === stage ? 'rgb(var(--accent))' : 'rgb(var(--faint))'), boxShadow: i === stage ? '0 0 14px rgb(var(--accent) / 0.6)' : 'none' }} className="readout">{i < stage ? '✓' : i + 1}</div>
                  <div className="readout" style={{ fontSize: 10, color: i <= stage ? 'rgb(var(--ink))' : 'rgb(var(--faint))' }}>{s.l}</div>
                </div>
                {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: i < stage ? 'rgb(var(--accent))' : 'rgb(var(--line))' }}></div>}
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
            <button className="btn" disabled={stage === 0} onClick={() => { if (stage > 0) { setStage(stage - 1); addLog('状态回退 → ' + STAGES[stage - 1].k); } }} style={stage === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : null}>← 回退</button>
            <button className="btn btn-primary" disabled={stage === STAGES.length - 1} onClick={() => { if (stage < STAGES.length - 1) { setStage(stage + 1); addLog('状态推进 → ' + STAGES[stage + 1].k); } }} style={stage === STAGES.length - 1 ? { opacity: 0.4, cursor: 'not-allowed' } : null}>推进至 {stage < STAGES.length - 1 ? STAGES[stage + 1].l : '—'} →</button>
          </div>
        </div>
      </div>

      <div className="scr-2col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* draft controls */}
        <div className="panel">
          <PanelHead idx="DRAFT" title="选秀控制" right={paused ? <span className="chip" style={toneStyle('bad')}>已暂停</span> : <span className="chip" style={toneStyle('good')}><span className="live-dot"></span>进行中</span>} />
          <div style={{ padding: 18, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">当前轮次</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-sm" onClick={() => { setRound(Math.max(1, round - 1)); addLog('轮次调整 → 第 ' + Math.max(1, round - 1) + ' 轮'); }}>−</button>
                <span className="serial" style={{ fontSize: 30 }}>{round}</span>
                <button className="btn btn-sm" onClick={() => { setRound(round + 1); addLog('轮次调整 → 第 ' + (round + 1) + ' 轮'); }}>+</button>
              </div>
            </div>
            <div className="hr"></div>
            <div>
              <span className="label" style={{ display: 'block', marginBottom: 9 }}>选秀模式</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['SNAKE', '蛇形'], ['REVERSE_LAST', '末位优先'], ['BUDGET_DESC', '预算降序']].map(([k, l]) => (
                  <button key={k} className={'btn btn-sm' + (mode === k ? ' btn-primary' : '')} onClick={() => { setMode(k); addLog('模式切换 → ' + k); }}>{l}</button>
                ))}
              </div>
            </div>
            <div className="hr"></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => { setPaused(!paused); addLog(paused ? '恢复选秀' : '暂停选秀'); }}>{paused ? '▶ 恢复' : '⏸ 暂停'}</button>
              <button className="btn" onClick={() => addLog('撤销上一手选择')}>↩ 撤销选择</button>
              <button className="btn" onClick={() => addLog('跳过当前队伍计时')}>⏭ 跳过</button>
            </div>
            <div style={{ padding: 12, border: '1px solid rgb(var(--bad) / 0.4)', background: 'rgb(var(--bad) / 0.05)' }}>
              <div className="kicker" style={{ color: 'rgb(var(--bad))', marginBottom: 8 }}>危险操作</div>
              <button className="btn" style={{ borderColor: 'rgb(var(--bad) / 0.5)', color: 'rgb(var(--bad))' }} onClick={() => addLog('⚠ 重置选秀(全部撤销)')}>重置选秀</button>
            </div>
          </div>
        </div>

        {/* op log */}
        <div className="panel scan">
          <PanelHead idx="LOG" title="操作日志" right={<span className="live-dot"></span>} />
          <div style={{ padding: '8px 0', maxHeight: 360, overflow: 'auto' }}>
            {log.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 11, padding: '10px 16px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}>
                <span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 1 }}>{e.t}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))' }}>{e.x}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   ADMIN AUDIT — full log
   ===================================================================== */
function AdminAudit() {
  const [f, setF] = aS('ALL');
  const types = ['ALL'].concat([...new Set(AUDIT.map(e => e.action))]);
  const rows = AUDIT.filter(e => f === 'ALL' || e.action === f);
  return (
    <div className="fade-in" style={{ padding: 22, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {types.map(t => (
          <button key={t} className={'btn btn-sm' + (f === t ? ' btn-primary' : '')} onClick={() => setF(t)}>{t === 'ALL' ? '全部' : t.replace(/_/g, ' ')}</button>
        ))}
      </div>
      <div className="panel">
        <PanelHead idx="LEDGER" title={'审计日志 · ' + rows.length} right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>IMMUTABLE</span>} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['时间', '操作', '对象', '执行者', '详情'].map((h, i) => <th key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="row-hover">
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }} className="readout"><span style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{e.t}</span></td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }}><span className="chip" style={toneStyle(ACT_TONE[e.action])}>{e.action.replace(/_/g, ' ')}</span></td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', fontSize: 12, color: 'rgb(var(--dim))' }}>{e.entity}</td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)' }} className="readout"><span style={{ fontSize: 11.5, color: 'rgb(var(--dim))' }}>{e.user}</span></td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--line) / 0.35)', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))' }}>{e.payload}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ADMIN_NAV = [
  { key: 'aoverview', glyph: '▦', label: '控制概览', sub: 'CONTROL' },
  { key: 'reg', glyph: '⊕', label: '报名审核', sub: 'REVIEW' },
  { key: 'teams', glyph: '⬡', label: '队伍管理', sub: 'ROSTERS' },
  { key: 'control', glyph: '◈', label: '赛事控制', sub: 'STATE · DRAFT' },
  { key: 'audit', glyph: '▤', label: '审计日志', sub: 'AUDIT' },
];

Object.assign(window, { AdminOverview, AdminRegistrations, AdminTeams, AdminControl, AdminAudit, ADMIN_NAV });
