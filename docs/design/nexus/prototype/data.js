/* LoL 内战系统 — mock data (seeded, deterministic).
   Mirrors the real Prisma model: Registration / Team / Draft / Tournament / Match / Game. */
(function () {
  // ---- seeded RNG ------------------------------------------------------
  let _s = 1337;
  function rnd() { _s = (_s * 1664525 + 1013904223) % 4294967296; return _s / 4294967296; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function rint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  // ---- constants -------------------------------------------------------
  const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
  const POS_LABEL = { TOP: '上单', JUNGLE: '打野', MID: '中单', ADC: '射手', SUPPORT: '辅助' };
  const POS_CHAR = { TOP: '上', JUNGLE: '野', MID: '中', ADC: '射', SUPPORT: '辅' };

  const RANKS = ['黄金 I', '铂金 III', '铂金 I', '钻石 IV', '钻石 II', '大师', '宗师'];
  const CHAMP_SET = ['亚索', '劫', '锐雯', '盲僧', '卡莎', '璐璐', '妖姬', '卡牌', '锤石', '厄运小姐',
    '蛮王', '皇子', '发条', '维鲁斯', '牛头', '酒桶', '飞机', '寡妇', '剑姬',
    '泰隆', '艾克', '霞', '洛', '佐伊'];

  const cleanNicks = ['影刃', '清线狂魔', '上野联动', '孤儿院院长', '团战暴君', '丝血反杀', '野区霸主',
    '中路核弹', '残血收割', '辅助之光', '钢铁洪流', '暗夜猎手', '疾风剑豪', '深渊巨口',
    '风暴之怒', '虚空遁地', '光辉女郎', '诺手本手', '逆风翻盘', '正面硬刚', '蜘蛛女王',
    '萨勒芬妮', '末日使者', '寒冰大炮', '电棍', 'Faker', 'Uzi', 'TheShy', '小天', '宁王',
    '阿水', '左手', 'Rookie', '香锅', '厂长', '微笑', '草莓', '高地', '凤凰', '夜叙',
    '雾隐', '霜寒', '雷霆', '苍穹之子'];

  const TEAM_NAMES = ['暗影军团', '风暴战队', '深渊先锋', '黎明守卫', '雷霆突击', '苍穹之翼', '寒冰之心', '烈焰雄狮'];
  const SLOGANS = ['一战封神', '永不言弃', '团结即力量', '为荣耀而战', '碾压全场', '逆风翻盘王者归来', '稳如老狗', '快乐打野'];

  // ---- tournament ------------------------------------------------------
  const tournament = {
    name: 'S1 春季内战赛',
    kind: '正赛',
    status: 'GROUP_STAGE',
    teamBudget: 1000,
    config: { template: 'group-knockout', groupCount: 2, teamsPerGroup: 4, advancingPerGroup: 2, groupBestOf: 1, knockoutBestOf: { SF: 3, FINAL: 5 } },
  };

  // ---- players / registrations ----------------------------------------
  const players = [];
  let nickIdx = 0;
  const TEAM_COUNT = 8;
  const POOL_EXTRA = 6; // undrafted players left in pool
  const total = TEAM_COUNT * 5 + POOL_EXTRA;

  for (let i = 0; i < total; i++) {
    const primary = [pick(POSITIONS)];
    if (rnd() > 0.6) { const s = pick(POSITIONS); if (s !== primary[0]) primary.push(s); }
    const secondary = [];
    if (rnd() > 0.45) { const s = pick(POSITIONS); if (!primary.includes(s)) secondary.push(s); }
    const nick = cleanNicks[nickIdx % cleanNicks.length]; nickIdx++;
    players.push({
      id: 'reg_' + i,
      gameId: (nick.match(/[A-Za-z]/) ? nick : 'Player') + '#' + rint(100, 999),
      nickname: nick,
      primaryPositions: primary.slice(0, 1),
      secondaryPositions: secondary,
      currentRank: pick(RANKS),
      peakRank: pick(RANKS),
      willingToCaptain: rnd() > 0.7,
      statement: rnd() > 0.6 ? pick(['carry 全场不是梦', '稳健运营，团战听我指挥', '给我一个机会还你一个王者', '上分使者在此', '辅助也能当 C 位']) : '',
      cost: Math.round((40 + rnd() * 160)) / 1, // 40 - 200 CR
      isCaptain: false,
      teamId: null,
      position: null,
      status: 'ACTIVE',
    });
  }

  // ---- teams + draft assignment ---------------------------------------
  const teams = [];
  let pIdx = 0;
  for (let t = 0; t < TEAM_COUNT; t++) {
    const captain = players[pIdx];
    captain.isCaptain = true; captain.willingToCaptain = true;
    const slots = POSITIONS.map((pos) => ({ position: pos, registration: null }));
    const team = {
      id: 'team_' + t,
      name: TEAM_NAMES[t],
      slogan: SLOGANS[t],
      captainId: captain.id,
      captainNickname: captain.nickname,
      captainGameId: captain.gameId,
      budgetLeft: tournament.teamBudget,
      group: t < 4 ? 'A' : 'B',
      slots,
      picks: [],
    };
    // captain takes their own position slot
    const capPos = captain.primaryPositions[0];
    captain.teamId = team.id; captain.position = capPos;
    team.slots.find(s => s.position === capPos).registration = captain;
    pIdx++;
    teams.push(team);
  }
  // fill remaining 4 slots per team from pool
  for (const team of teams) {
    for (const slot of team.slots) {
      if (slot.registration) continue;
      // find next unassigned player who can play this pos (or any)
      while (pIdx < TEAM_COUNT * 5) {
        const p = players[pIdx];
        if (!p.teamId) {
          const cost = p.cost;
          p.teamId = team.id; p.position = slot.position;
          slot.registration = p;
          team.budgetLeft -= cost;
          team.picks.push({ registrationId: p.id, position: slot.position, costPaid: cost });
          pIdx++;
          break;
        }
        pIdx++;
      }
    }
    team.budgetLeft = Math.max(0, Math.round(team.budgetLeft));
  }
  const poolPlayers = players.slice(TEAM_COUNT * 5); // undrafted

  // ---- live draft snapshot (for the /live + admin draft console) -------
  // Simulate a draft mid-progress: 6 of 8 teams fully picked, round 4 in progress.
  const draft = {
    status: 'IN_PROGRESS',
    currentRound: 4,
    totalRounds: 4,
    onTheClockTeamId: 'team_6',
    teams: teams.map((tm, i) => {
      // teams 6,7 partially filled for "live" feel
      const filledCount = i < 6 ? 5 : (i === 6 ? 3 : 4);
      const slots = tm.slots.map((s, si) => ({ position: s.position, registration: si < filledCount ? s.registration : null }));
      const spent = tournament.teamBudget - slots.filter(s => s.registration).reduce((a, s) => a + (s.registration ? s.registration.cost : 0), 0);
      return {
        id: tm.id, captainNickname: tm.captainNickname, captainGameId: tm.captainGameId,
        name: tm.name, budgetLeft: i < 6 ? tm.budgetLeft : Math.round(spent), slots,
      };
    }),
    pool: poolPlayers.map(p => ({ ...p, isPicked: false }))
      .concat(teams.slice(6).flatMap(tm => tm.slots.slice(tm.id === 'team_6' ? 3 : 4).map(s => s.registration).filter(Boolean).map(p => ({ ...p, isPicked: false })))),
    events: [
      { seq: 41, type: 'PICK_MADE', actor: '暗影军团', text: '暗影军团 选择 影刃 (中单) — 120 CR', t: '14:32' },
      { seq: 40, type: 'ROUND_STARTED', actor: '系统', text: '第 4 轮开始 · 模式 REVERSE_LAST', t: '14:30' },
      { seq: 39, type: 'PICK_MADE', actor: '寒冰之心', text: '寒冰之心 选择 清线狂魔 (上单) — 95 CR', t: '14:28' },
      { seq: 38, type: 'PICK_REVOKED', actor: '管理员', text: '撤销 烈焰雄狮 上一手选择', t: '14:26' },
      { seq: 37, type: 'PICK_MADE', actor: '风暴战队', text: '风暴战队 选择 野区霸主 (打野) — 140 CR', t: '14:24' },
      { seq: 36, type: 'ROUND_STARTED', actor: '系统', text: '第 3 轮开始 · 模式 BUDGET_DESC', t: '14:20' },
    ],
  };

  // ---- matches / schedule ----------------------------------------------
  const matches = [];
  const groupA = teams.filter(t => t.group === 'A');
  const groupB = teams.filter(t => t.group === 'B');
  let mid = 0;
  const day = (d, h, m) => new Date(2026, 5, d, h, m).toISOString();
  function addRR(grp, gname, d0) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++) {
        const finished = rnd() > 0.4;
        const winner = finished ? pick([grp[i], grp[j]]) : null;
        matches.push({
          id: 'm_' + (mid++), label: gname + ' 小组赛', group: gname,
          teamA: { id: grp[i].id, name: grp[i].name }, teamB: { id: grp[j].id, name: grp[j].name },
          bestOf: 1, scheduledAt: day(d0 + Math.floor((i + j) / 2), 19 + ((i + j) % 3), (i * 17 + j * 13) % 60),
          status: finished ? 'FINISHED' : 'SCHEDULED', winnerTeamId: winner ? winner.id : null,
        });
      }
  }
  addRR(groupA, 'A组', 12);
  addRR(groupB, 'B组', 13);
  // knockout placeholders
  matches.push({ id: 'm_sf1', label: '半决赛 1', group: null, teamA: { id: groupA[0].id, name: groupA[0].name }, teamB: { id: groupB[1].id, name: groupB[1].name }, bestOf: 3, scheduledAt: day(20, 20, 0), status: 'SCHEDULED', winnerTeamId: null });
  matches.push({ id: 'm_sf2', label: '半决赛 2', group: null, teamA: { id: groupB[0].id, name: groupB[0].name }, teamB: { id: groupA[1].id, name: groupA[1].name }, bestOf: 3, scheduledAt: day(20, 20, 40), status: 'SCHEDULED', winnerTeamId: null });
  matches.push({ id: 'm_final', label: '总决赛', group: null, teamA: null, teamB: null, bestOf: 5, scheduledAt: day(21, 20, 0), status: 'SCHEDULED', winnerTeamId: null });

  // ---- standings -------------------------------------------------------
  function standingsFor(grp, gname) {
    const rows = grp.map(t => {
      const ms = matches.filter(m => m.status === 'FINISHED' && (m.teamA && m.teamA.id === t.id || m.teamB && m.teamB.id === t.id));
      const wins = ms.filter(m => m.winnerTeamId === t.id).length;
      const played = ms.length;
      return { teamId: t.id, name: t.name, played, wins, losses: played - wins, points: wins * 3 };
    }).sort((a, b) => b.points - a.points || b.wins - a.wins);
    rows.forEach((r, i) => { r.rank = i + 1; r.tied = i > 0 && r.points === rows[i - 1].points; });
    return { groupId: gname, name: gname, rows };
  }
  const standings = [standingsFor(groupA, 'A 组'), standingsFor(groupB, 'B 组')];

  // ---- per-player tournament stats (leaderboard + profile) -------------
  const drafted = players.filter(p => p.teamId);
  function teamName(id) { const t = teams.find(x => x.id === id); return t ? t.name : '未分队'; }
  const profiles = drafted.map((p) => {
    const games = rint(3, 9);
    const rows = [];
    let k = 0, d = 0, a = 0, cs = 0, dmg = 0, gold = 0, wins = 0, mvp = 0;
    for (let g = 0; g < games; g++) {
      const win = rnd() > 0.45; if (win) wins++;
      const gk = rint(0, 12), gd = rint(0, 8), ga = rint(2, 18), gcs = rint(120, 320), gdmg = rint(9000, 42000), ggold = rint(8000, 18000);
      const isMvp = win && rnd() > 0.7; if (isMvp) mvp++;
      k += gk; d += gd; a += ga; cs += gcs; dmg += gdmg; gold += ggold;
      rows.push({ gameId: p.id + '_g' + g, matchId: pick(matches).id, matchLabel: pick(['A组 小组赛', 'B组 小组赛', '半决赛 1']), opponent: teamName(pick(teams).id), champion: pick(CHAMP_SET), kills: gk, deaths: gd, assists: ga, cs: gcs, damage: gdmg, gold: ggold, win, isMvp });
    }
    const kda = ((k + a) / Math.max(1, d));
    const champCount = {};
    rows.forEach(r => { champCount[r.champion] = (champCount[r.champion] || 0) + 1; });
    const commonChampions = Object.entries(champCount).map(([championName, gc]) => ({ championName, games: gc, winRate: Math.round(rnd() * 40 + 45), kda: Math.round(rnd() * 30 + 20) / 10 })).sort((x, y) => y.games - x.games).slice(0, 4);
    return {
      playerId: p.id, nickname: p.nickname, teamName: teamName(p.teamId), primaryPosition: POS_LABEL[p.primaryPositions[0]],
      recentForm: rows.slice(-8).map(r => r.win),
      summary: {
        games, wins, winRate: Math.round((wins / games) * 100), avgKills: Math.round(k / games * 10) / 10, avgDeaths: Math.round(d / games * 10) / 10,
        avgAssists: Math.round(a / games * 10) / 10, kda: Math.round(kda * 100) / 100, avgCs: Math.round(cs / games), avgDamage: Math.round(dmg / games), avgGold: Math.round(gold / games), mvpCount: mvp,
      },
      commonChampions, games: rows,
    };
  }).sort((a, b) => b.summary.kda - a.summary.kda);

  // ---- overview stats --------------------------------------------------
  const overview = {
    registrationCount: players.length,
    captainIntentionCount: players.filter(p => p.willingToCaptain).length,
    teamCount: teams.length,
    matchCount: matches.length,
    finishedCount: matches.filter(m => m.status === 'FINISHED').length,
    draftStatus: draft.status,
  };

  // ---- audit log -------------------------------------------------------
  const audit = [
    { id: 1, action: 'MATCH_FINISHED', entity: 'Match', user: 'admin', payload: '暗影军团 2:0 风暴战队', t: '06-15 21:14' },
    { id: 2, action: 'DRAFT_PICK', entity: 'DraftPick', user: 'captain_暗影军团', payload: '选择 影刃 · 120 CR', t: '06-14 14:32' },
    { id: 3, action: 'ROUND_STARTED', entity: 'DraftRound', user: 'admin', payload: 'round=4 mode=REVERSE_LAST', t: '06-14 14:30' },
    { id: 4, action: 'REGISTRATION_EXCLUDED', entity: 'Registration', user: 'admin', payload: '排除重复报名 Player#204', t: '06-13 10:02' },
    { id: 5, action: 'TOURNAMENT_STATUS', entity: 'Tournament', user: 'admin', payload: 'REGISTRATION → ROSTER_LOCKED', t: '06-12 23:50' },
    { id: 6, action: 'TEAM_CREATED', entity: 'Team', user: 'admin', payload: '创建队伍账号 ×8', t: '06-12 22:10' },
  ];

  window.LOL_DATA = {
    POSITIONS, POS_LABEL, POS_CHAR, RANKS, CHAMP_SET,
    tournament, players, teams, poolPlayers, draft, matches, standings, profiles, overview, audit,
  };
})();
