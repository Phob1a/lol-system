/* NEXUS — Players (leaderboard + detail) · Draft (live board) · Signup. */
const D2 = window.LOL_DATA;
const { useState: uS2, useMemo: uM2 } = React;

/* =====================================================================
   PLAYERS — leaderboard + selected player observation file
   ===================================================================== */
function PlayersScreen() {
  const [sel, setSel] = uS2(D2.profiles[0].playerId);
  const [sortKey, setSortKey] = uS2('kda');
  const [posF, setPosF] = uS2('ALL');
  const [q, setQ] = uS2('');
  const p = D2.profiles.find(x => x.playerId === sel) || D2.profiles[0];
  const s = p.summary;
  const pPos = (pr) => { const pl = D2.players.find(x => x.id === pr.playerId); return pl ? pl.primaryPositions[0] : null; };
  const pCost = (pr) => { const pl = D2.players.find(x => x.id === pr.playerId); return pl ? pl.cost : 0; };
  const SORTS = [['kda', 'KDA'], ['winRate', '胜率'], ['avgDamage', '输出'], ['games', '场次'], ['cost', '身价']];
  const list = uM2(() => {
    const arr = D2.profiles.filter(pr => {
      if (posF !== 'ALL' && pPos(pr) !== posF) return false;
      if (q && (pr.nickname + pr.teamName).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
      return true;
    });
    const val = (pr) => sortKey === 'cost' ? pCost(pr) : pr.summary[sortKey];
    return arr.slice().sort((a, b) => val(b) - val(a));
  }, [sortKey, posF, q]);
  const colVal = (pr) => sortKey === 'cost' ? pCost(pr) : sortKey === 'winRate' ? pr.summary.winRate + '%' : sortKey === 'avgDamage' ? (pr.summary.avgDamage / 1000).toFixed(1) + 'K' : sortKey === 'games' ? pr.summary.games : pr.summary.kda;
  const radarAxes = [
    { label: 'KDA', v: Math.min(1, s.kda / 6) },
    { label: '输出', v: Math.min(1, s.avgDamage / 36000) },
    { label: '经济', v: Math.min(1, s.avgGold / 16000) },
    { label: '补刀', v: Math.min(1, s.avgCs / 300) },
    { label: '胜率', v: s.winRate / 100 },
  ];
  return (
    <div className="fade-in scr-side" style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, padding: 22, alignItems: 'start' }}>
      {/* leaderboard */}
      <div className="panel" style={{ alignSelf: 'stretch' }}>
        <PanelHead idx="CATALOGUE" title={'选手目录 · ' + list.length} right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>按 {SORTS.find(x => x[0] === sortKey)[1]}</span>} />
        <div style={{ padding: '10px 12px', display: 'grid', gap: 9, borderBottom: '1px solid rgb(var(--line))' }}>
          <input className="field" style={{ height: 34 }} placeholder="搜索昵称 / 战队…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SORTS.map(([k, l]) => <button key={k} className={'chip' + (sortKey === k ? ' ac' : '')} style={{ cursor: 'pointer' }} onClick={() => setSortKey(k)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={'chip' + (posF === 'ALL' ? ' ac' : '')} style={{ cursor: 'pointer' }} onClick={() => setPosF('ALL')}>全部</button>
            {D2.POSITIONS.map(pos => <button key={pos} className={'chip' + (posF === pos ? ' ac' : '')} style={{ cursor: 'pointer' }} onClick={() => setPosF(pos)}>{D2.POS_LABEL[pos]}</button>)}
          </div>
        </div>
        <div className="lb-scroll" style={{ maxHeight: 560, overflow: 'auto' }}>
          {list.map((pr, i) => (
            <PlayerHover key={pr.playerId} playerId={pr.playerId}>
            <button className={'lbrow' + (pr.playerId === sel ? ' on' : '')} style={{ width: '100%', border: 'none', cursor: 'pointer', gridTemplateColumns: '34px 1fr 64px 70px' }} onClick={() => setSel(pr.playerId)}>
              <span className="readout" style={{ fontSize: 13, color: i < 3 ? 'rgb(var(--accent))' : 'rgb(var(--faint))', fontWeight: 700, textAlign: 'left' }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgb(var(--ink))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.nickname}</div>
                <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{pr.teamName}</div>
              </div>
              <span className="readout" style={{ fontSize: 11, color: 'rgb(var(--dim))' }}>{pr.primaryPosition}</span>
              <span className="readout accent-t" style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{colVal(pr)}</span>
            </button>
            </PlayerHover>
          ))}
          {!list.length && <div className="readout" style={{ padding: 24, textAlign: 'center', color: 'rgb(var(--faint))' }}>无匹配选手</div>}
        </div>
      </div>

      {/* player file */}
      <div style={{ display: 'grid', gap: 18 }}>
        <div className="panel glow" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <Kicker style={{ marginBottom: 8 }}>OBSERVATION FILE · {p.playerId.toUpperCase()}</Kicker>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'rgb(var(--dim))', marginBottom: 2 }}><span style={{ cursor: 'pointer', borderBottom: '1px dotted rgb(var(--faint))' }} onClick={() => { const tm = D2.teams.find(t => t.name === p.teamName); if (tm && window.__nexusGoTeam) window.__nexusGoTeam(tm.id); }}>{p.teamName}</span> · {p.primaryPosition}</div>
              <div className="title-xl" style={{ fontSize: 42, color: 'rgb(var(--ink))' }}>{p.nickname}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <span className="kicker">近期战绩</span>
                <FormDots form={p.recentForm} />
              </div>
            </div>
            <WinDonut pct={s.winRate} size={104} />
          </div>
        </div>

        {/* stat tiles */}
        <div className="quad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <DTile label="场次" value={s.games} sub={s.wins + ' 胜 ' + (s.games - s.wins) + ' 负'} />
          <DTile label="KDA" value={s.kda} sub={s.avgKills + ' / ' + s.avgDeaths + ' / ' + s.avgAssists} />
          <DTile label="场均输出" value={(s.avgDamage / 1000).toFixed(1) + 'K'} sub={'补刀 ' + s.avgCs} />
          <DTile label="MVP" value={s.mvpCount} ico={<span style={{ color: 'rgb(var(--gold))' }}>★</span>} sub={'经济 ' + (s.avgGold / 1000).toFixed(1) + 'K'} />
        </div>

        <div className="twin" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* radar */}
          <div className="panel">
            <PanelHead idx="RADAR" title="能力雷达" />
            <div style={{ padding: 18, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 230 }}><PlayerRadar axes={radarAxes} size={230} /></div>
            </div>
          </div>
          {/* champions */}
          <div className="panel">
            <PanelHead idx="CHAMP" title="常用英雄" />
            <div style={{ padding: 18 }}><ChampBars champs={p.commonChampions} /></div>
          </div>
        </div>

        {/* season trend */}
        <div className="panel">
          <PanelHead idx="TREND" title="赛季趋势 · 胜负净值" right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{s.wins} 胜 {s.games - s.wins} 负</span>} />
          <div style={{ padding: 18 }}><SeasonTrend games={p.games} w={900} h={84} /></div>
        </div>

        {/* recent games */}
        <div className="panel">
          <PanelHead idx="LOG" title="对局记录" right={<span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>{p.games.length} 局</span>} />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['英雄', '对手', 'K/D/A', '补刀', '输出', '结果'].map((h, k) => <th key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--faint))', fontWeight: 600, textAlign: k > 1 ? 'center' : 'left', padding: '8px 14px', borderBottom: '1px solid rgb(var(--line))' }}>{h}</th>)}</tr></thead>
            <tbody>
              {p.games.slice(0, 8).map((g, k) => (
                <tr key={k}>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgb(var(--ink))' }}>{g.champion}{g.isMvp && <span style={{ color: 'rgb(var(--gold))', marginLeft: 5 }}>★</span>}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', fontSize: 12, color: 'rgb(var(--dim))' }}>{g.opponent}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }} className="readout">{g.kills}/{g.deaths}/{g.assists}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }} className="readout">{g.cs}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }} className="readout">{(g.damage / 1000).toFixed(1)}K</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid rgb(var(--line) / 0.4)', textAlign: 'center' }}><span className="chip" style={{ borderColor: g.win ? 'rgb(var(--good) / 0.5)' : 'rgb(var(--bad) / 0.5)', color: g.win ? 'rgb(var(--good))' : 'rgb(var(--bad))' }}>{g.win ? '胜' : '负'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   DRAFT — live draft command board
   ===================================================================== */
function DraftScreen() {
  const dr = D2.draft;
  const [picked, setPicked] = uS2(null);
  const onClock = dr.teams.find(t => t.id === dr.onTheClockTeamId);
  const POS = D2.POSITIONS;
  return (
    <div className="fade-in scr-side-r" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, padding: 22, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18 }}>
        {/* status strip */}
        <div className="panel glow hot-edge" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="live-dot"></span>
            <div>
              <Kicker>选秀进行中 · REVERSE_LAST</Kicker>
              <div className="title-xl" style={{ fontSize: 24, color: 'rgb(var(--ink))', marginTop: 2 }}>第 {dr.currentRound} / {dr.totalRounds} 轮</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Kicker>ON THE CLOCK · 选择中</Kicker>
            <div className="title-xl hot-t" style={{ fontSize: 24, marginTop: 2 }}>{onClock ? onClock.name : '—'}</div>
          </div>
        </div>

        {/* teams grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {dr.teams.map((tm, ti) => {
            const filled = tm.slots.filter(s => s.registration).length;
            const isClock = tm.id === dr.onTheClockTeamId;
            return (
              <div key={tm.id} className={'panel' + (isClock ? ' glow hot-edge' : '')} style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14.5, color: isClock ? 'rgb(var(--accent))' : 'rgb(var(--ink))' }}><TeamHover teamId={tm.id}><span style={{ cursor: 'help' }}>{tm.name}</span></TeamHover></div>
                    <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>队长 {tm.captainNickname} · {filled}/5</div>
                  </div>
                  {isClock && <span className="chip hot">选择中</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {tm.slots.map((sl, si) => (
                    <div key={si} style={{ flex: 1, textAlign: 'center' }}>
                      <PosPip pos={sl.position} on={!!sl.registration} size={28} />
                      <div className="readout" style={{ fontSize: 8.5, color: sl.registration ? 'rgb(var(--dim))' : 'rgb(var(--faint))', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sl.registration ? sl.registration.nickname.slice(0, 4) : '空'}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="kicker">预算余额</span>
                  <span className="readout accent-t" style={{ fontSize: 11 }}>{tm.budgetLeft} CR</span>
                </div>
                <SegBudget used={tm.budgetLeft} total={D2.tournament.teamBudget} segs={20} />
              </div>
            );
          })}
        </div>

        {/* pool */}
        <div className="panel">
          <PanelHead idx="POOL" title={'选手池 · ' + dr.pool.length + ' 可选'} right={picked ? <span className="btn btn-primary btn-sm" onClick={() => setPicked(null)}>确认选择 {picked.nickname}</span> : <span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))' }}>点选预览</span>} />
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {dr.pool.slice(0, 12).map((pl) => (
              <PlayerHover key={pl.id} playerId={pl.id} w={240}>
              <button className={'poolcard' + (picked && picked.id === pl.id ? ' on' : '')} style={{ border: 'none', textAlign: 'left' }} onClick={() => setPicked(pl)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <PosPip pos={pl.primaryPositions[0]} on size={24} />
                  <span className="readout accent-t" style={{ fontSize: 13, fontWeight: 700 }}>{pl.cost} CR</span>
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'rgb(var(--ink))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.nickname}</div>
                <div className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 2 }}>{pl.currentRank}</div>
              </button>
              </PlayerHover>
            ))}
          </div>
        </div>
      </div>

      {/* event log */}
      <div className="panel scan" style={{ position: 'sticky', top: 76 }}>
        <PanelHead idx="LOG-IO" title="选秀事件流" right={<span className="live-dot"></span>} />
        <div style={{ padding: '8px 0' }}>
          {dr.events.map((e, i) => (
            <div key={e.seq} className="step" style={{ padding: '10px 16px', gridTemplateColumns: 'auto 1fr', borderBottom: i === dr.events.length - 1 ? 'none' : '1px solid rgb(var(--line) / 0.4)' }}>
              <span className="readout" style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 1 }}>{e.t}</span>
              <div>
                <span className="chip" style={{ marginBottom: 5, borderColor: e.type === 'PICK_MADE' ? 'rgb(var(--accent) / 0.6)' : e.type === 'PICK_REVOKED' ? 'rgb(var(--bad) / 0.5)' : 'rgb(var(--line))', color: e.type === 'PICK_MADE' ? 'rgb(var(--accent))' : e.type === 'PICK_REVOKED' ? 'rgb(var(--bad))' : 'rgb(var(--dim))' }}>{e.type.replace('_', ' ')}</span>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'rgb(var(--ink))', marginTop: 4, lineHeight: 1.4 }}>{e.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   SIGNUP — registration form
   ===================================================================== */
function AvatarSlot({ url, onPick, size = 56 }) {
  const ref = React.useRef(null);
  return (
    <span style={{ position: 'relative', flex: 'none' }}>
      <button onClick={() => ref.current && ref.current.click()} className="champ-av" title="上传头像" style={{ width: size, height: size, padding: 0, cursor: 'pointer', border: '1px solid rgb(var(--accent) / 0.5)', background: url ? 'transparent' : 'linear-gradient(135deg, rgb(var(--accent) / 0.2), rgb(var(--panel-2)))', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="readout" style={{ fontSize: 9, color: 'rgb(var(--accent))', textAlign: 'center', lineHeight: 1.3 }}>上传<br />头像</span>}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onPick(URL.createObjectURL(f)); }} />
    </span>
  );
}

function SignupScreen() {
  const POS = D2.POSITIONS, POS_LABEL = D2.POS_LABEL;
  const [form, setForm] = uS2({ gameId: '', nickname: '', curRank: '', peakRank: '', statement: '' });
  const [touched, setTouched] = uS2({});
  const [primary, setPrimary] = uS2('MID');
  const [secondary, setSecondary] = uS2([]);
  const [captain, setCaptain] = uS2(false);
  const [avatar, setAvatar] = uS2(null);
  const [submitted, setSubmitted] = uS2(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const touch = (k) => setTouched(t => ({ ...t, [k]: true }));
  const toggleSec = (p) => setSecondary(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);

  const errs = {
    gameId: !form.gameId.trim() ? '必填' : !/#/.test(form.gameId) ? '格式如 Player#888' : '',
    nickname: !form.nickname.trim() ? '必填' : form.nickname.length > 12 ? '不超过 12 字' : '',
    curRank: !form.curRank.trim() ? '必填' : '',
  };
  const valid = !errs.gameId && !errs.nickname && !errs.curRank;
  const reset = () => { setForm({ gameId: '', nickname: '', curRank: '', peakRank: '', statement: '' }); setTouched({}); setSecondary([]); setCaptain(false); setPrimary('MID'); setAvatar(null); setSubmitted(false); };
  const submit = () => { setTouched({ gameId: true, nickname: true, curRank: true }); if (valid) setSubmitted(true); };

  const Field = ({ k, label, ph }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span className="label">{label}</span>
        {touched[k] && errs[k] && <span className="readout" style={{ fontSize: 10, color: 'rgb(var(--bad))' }}>{errs[k]}</span>}
      </div>
      <input className="field" placeholder={ph} value={form[k]} onChange={(e) => set(k, e.target.value)} onBlur={() => touch(k)} style={touched[k] && errs[k] ? { borderColor: 'rgb(var(--bad))' } : (form[k] && !errs[k] ? { borderColor: 'rgb(var(--good) / 0.6)' } : null)} />
    </div>
  );

  const PlayerCard = ({ big }) => (
    <div className={'panel glow' + (big ? ' hot-edge' : '')} style={{ padding: big ? 26 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Kicker>选手卡 · {big ? '已生成' : '预览'}</Kicker>
        {big && <span className="chip" style={{ borderColor: 'rgb(var(--good) / 0.6)', color: 'rgb(var(--good))' }}>报名成功</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        {avatar ? <span className="champ-av" style={{ width: big ? 64 : 52, height: big ? 64 : 52, overflow: 'hidden', border: '1px solid rgb(var(--accent) / 0.5)', display: 'inline-block', flex: 'none' }}><img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span> : <PosPip pos={primary} on size={big ? 56 : 48} />}
        <div style={{ minWidth: 0 }}>
          <div className="title-xl" style={{ fontSize: big ? 32 : 26, color: 'rgb(var(--ink))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.nickname || '影刃'}</div>
          <div className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{form.curRank || '钻石 IV'} · {POS_LABEL[primary]}</div>
        </div>
      </div>
      <div className="glow-rule" style={{ margin: '14px 0' }}></div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">召唤师</span><span className="readout" style={{ color: 'rgb(var(--ink))' }}>{form.gameId || '—'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">主位置</span><span className="readout accent-t">{POS_LABEL[primary]}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">副位置</span><span className="readout" style={{ color: 'rgb(var(--ink))' }}>{secondary.length ? secondary.map(p => POS_LABEL[p]).join(' / ') : '—'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">队长意向</span><span className="readout" style={{ color: captain ? 'rgb(var(--good))' : 'rgb(var(--faint))' }}>{captain ? '是' : '否'}</span></div>
      </div>
    </div>
  );

  if (submitted) {
    return (
      <div className="fade-in" style={{ padding: 22, display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ width: 'min(440px, 92vw)', display: 'grid', gap: 18, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 40, color: 'rgb(var(--good))', lineHeight: 1 }}>✓</div>
            <div className="title-xl" style={{ fontSize: 28, color: 'rgb(var(--ink))', marginTop: 10 }}>报名已提交</div>
            <div className="readout" style={{ fontSize: 12, color: 'rgb(var(--faint))', marginTop: 6 }}>已进入选手池 · 等待队长选秀</div>
          </div>
          <PlayerCard big />
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1, height: 44 }} onClick={() => alert('选手卡已复制分享链接')}>分享选手卡</button>
            <button className="btn" style={{ flex: 1, height: 44 }} onClick={reset}>再报一个</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in scr-side-r" style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, alignItems: 'start', maxWidth: 1100, margin: '0 auto' }}>
      <div className="panel" style={{ padding: 24 }}>
        <Kicker style={{ marginBottom: 6 }}>ENLIST · 报名注册</Kicker>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 26, color: 'rgb(var(--ink))', marginBottom: 4 }}>加入 {D2.tournament.name}</div>
        <div className="readout" style={{ fontSize: 11, color: 'rgb(var(--faint))', marginBottom: 22 }}>填写召唤师信息进入选手池 · 等待队长选秀</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <AvatarSlot url={avatar} onPick={setAvatar} size={56} />
          <div>
            <div className="label" style={{ marginBottom: 4 }}>头像 / 战队 Logo</div>
            <div className="readout" style={{ fontSize: 10.5, color: 'rgb(var(--faint))' }}>点击上传 · PNG / JPG</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field k="gameId" label="召唤师 ID" ph="Player#888" />
          <Field k="nickname" label="游戏昵称" ph="影刃" />
          <Field k="curRank" label="当前段位" ph="钻石 IV" />
          <Field k="peakRank" label="最高段位 (可选)" ph="大师" />
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 9 }}>主位置 · 单选</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {POS.map(p => (
              <button key={p} className={'btn' + (primary === p ? ' btn-primary' : '')} style={{ flex: 1, flexDirection: 'column', height: 'auto', padding: '10px 0', gap: 4 }} onClick={() => { setPrimary(p); setSecondary(s => s.filter(x => x !== p)); }}>
                <PosPip pos={p} on={primary === p} size={26} />
                <span style={{ fontSize: 11 }}>{POS_LABEL[p]}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 9 }}>副位置 · 可多选</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {POS.filter(p => p !== primary).map(p => (
              <button key={p} className={'chip' + (secondary.includes(p) ? ' ac' : '')} style={{ cursor: 'pointer', height: 30, padding: '0 14px' }} onClick={() => toggleSec(p)}>{POS_LABEL[p]}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 7 }}>参赛宣言</div>
          <textarea className="field" rows={2} placeholder="carry 全场不是梦…" value={form.statement} onChange={(e) => set('statement', e.target.value)}></textarea>
        </div>

        <button className={'btn' + (captain ? ' btn-primary' : '')} style={{ marginTop: 18, width: '100%' }} onClick={() => setCaptain(c => !c)}>
          {captain ? '✓ 已申请成为队长' : '申请成为队长 (可选)'}
        </button>

        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button className="btn btn-primary" style={{ flex: 1, height: 44, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }} onClick={submit}>提交报名 · ENLIST</button>
          <button className="btn" style={{ width: 120, height: 44 }} onClick={reset}>重置</button>
        </div>
        {!valid && Object.keys(touched).length > 0 && <div className="readout" style={{ fontSize: 11, color: 'rgb(var(--bad))', marginTop: 10 }}>请完善必填项后提交</div>}
      </div>

      {/* preview card */}
      <div style={{ display: 'grid', gap: 16, position: 'sticky', top: 76 }}>
        <PlayerCard />
        <div className="panel" style={{ padding: 18 }}>
          <Kicker style={{ marginBottom: 10 }}>报名概况</Kicker>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span className="label">当前报名</span><span className="readout accent-t" style={{ fontSize: 16, fontWeight: 700 }}>{D2.overview.registrationCount}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">队长意向</span><span className="readout" style={{ color: 'rgb(var(--ink))', fontSize: 16, fontWeight: 700 }}>{D2.overview.captainIntentionCount}</span></div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PlayersScreen, DraftScreen, SignupScreen });
