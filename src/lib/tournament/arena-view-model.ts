import type { PublicState } from '@/hooks/useTournamentState';

export type PublicTournamentState = NonNullable<PublicState>;
export type ArenaMatch = PublicTournamentState['matches'][number];

export type ArenaStats = {
  totalMatches: number;
  completedMatches: number;
  scheduledMatches: number;
  pendingMatches: number;
  liveMatches: number;
  progressPercent: number;
  teamCount: number;
  groupCount: number;
  bracketRoundCount: number;
};

export type ArenaHeadline = {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export type ArenaHotSignal = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'cyan' | 'amber' | 'emerald' | 'violet';
};

const FINISHED_STATUSES = new Set(['FINISHED', 'CANCELED', 'WALKOVER']);
const LIVE_STATUSES = new Set(['IN_PROGRESS', 'LIVE']);

function isFinished(match: ArenaMatch) {
  return FINISHED_STATUSES.has(match.status) || match.isWalkover;
}

function teamLabel(team: ArenaMatch['teamA']) {
  return team?.name ?? '待定席位';
}

export function formatArenaDateTime(iso: string | null): string {
  if (!iso) return '待同步';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function getNextMatch(matches: ArenaMatch[], now = new Date()): ArenaMatch | null {
  const nowTime = now.getTime();

  return (
    matches
      .filter((match) => match.scheduledAt && !isFinished(match))
      .filter((match) => new Date(match.scheduledAt as string).getTime() >= nowTime)
      .sort((a, b) => {
        return (
          new Date(a.scheduledAt as string).getTime() -
          new Date(b.scheduledAt as string).getTime()
        );
      })[0] ?? null
  );
}

export function getArenaStats(state: PublicTournamentState): ArenaStats {
  const teamIds = new Set<string>();

  for (const match of state.matches) {
    if (match.teamA?.id) teamIds.add(match.teamA.id);
    if (match.teamB?.id) teamIds.add(match.teamB.id);
  }

  for (const group of state.standings) {
    for (const teamId of Object.keys(group.teams)) {
      teamIds.add(teamId);
    }
  }

  const completedMatches = state.matches.filter(isFinished).length;
  const scheduledMatches = state.matches.filter((match) => {
    return match.status === 'SCHEDULED' && Boolean(match.scheduledAt);
  }).length;
  const liveMatches = state.matches.filter((match) => LIVE_STATUSES.has(match.status)).length;
  const totalMatches = state.matches.length;

  return {
    totalMatches,
    completedMatches,
    scheduledMatches,
    pendingMatches: Math.max(totalMatches - completedMatches - scheduledMatches, 0),
    liveMatches,
    progressPercent: totalMatches === 0 ? 0 : Math.round((completedMatches / totalMatches) * 100),
    teamCount: teamIds.size,
    groupCount: state.standings.length,
    bracketRoundCount: state.bracket.length,
  };
}

export function getTournamentHeadline(
  state: PublicTournamentState,
  now = new Date(),
): ArenaHeadline {
  const stats = getArenaStats(state);
  const nextMatch = getNextMatch(state.matches, now);

  if (stats.totalMatches > 0 && stats.completedMatches === stats.totalMatches) {
    return {
      eyebrow: 'PUBLIC ARENA / ARCHIVE READY',
      title: `${state.tournament.name}赛果已归档`,
      subtitle: '完整赛程、淘汰路径和选手数据已经同步，可以从数据榜回看关键表现。',
      primaryCtaLabel: '查看数据榜',
      primaryCtaHref: '#leaderboard',
      secondaryCtaLabel: '回看赛程',
      secondaryCtaHref: '#schedule',
    };
  }

  if (nextMatch) {
    return {
      eyebrow: 'PUBLIC ARENA / MATCH SIGNAL LOCKED',
      title: `${state.tournament.name}进入公共竞技场`,
      subtitle: `${teamLabel(nextMatch.teamA)} 与 ${teamLabel(
        nextMatch.teamB,
      )} 已锁定下一场信号，赛程和数据面板保持实时同步。`,
      primaryCtaLabel: '观看下一场',
      primaryCtaHref: `/tournament/match/${nextMatch.id}`,
      secondaryCtaLabel: '查看对阵图',
      secondaryCtaHref: '#bracket',
    };
  }

  return {
    eyebrow: 'PUBLIC ARENA / SYSTEM STANDBY',
    title: `${state.tournament.name}等待赛程同步`,
    subtitle: '赛事框架已经就绪，公开端会在排期完成后显示下一场、对阵路径和观赛入口。',
    primaryCtaLabel: '查看赛程',
    primaryCtaHref: '#schedule',
    secondaryCtaLabel: '查看小组赛',
    secondaryCtaHref: '#standings',
  };
}

export function getHotSignals(state: PublicTournamentState, now = new Date()): ArenaHotSignal[] {
  const stats = getArenaStats(state);
  const nextMatch = getNextMatch(state.matches, now);
  const leaderGroup = state.standings.find((group) => group.rows.length > 0);
  const leaderRow = leaderGroup?.rows.slice().sort((a, b) => a.rank - b.rank)[0];
  const leaderName = leaderRow && leaderGroup ? leaderGroup.teams[leaderRow.teamId] : null;

  return [
    {
      id: 'next-match',
      label: 'NEXT SIGNAL',
      value: nextMatch ? `${teamLabel(nextMatch.teamA)} vs ${teamLabel(nextMatch.teamB)}` : '待排期',
      detail: nextMatch
        ? `${nextMatch.label ?? nextMatch.roundKey ?? '赛事'} · ${formatArenaDateTime(
            nextMatch.scheduledAt,
          )}`
        : '暂无可公开的下一场比赛',
      tone: 'cyan',
    },
    {
      id: 'leader',
      label: 'GROUP LEAD',
      value: leaderName ?? '待产生',
      detail: leaderRow
        ? `${leaderGroup?.name ?? '小组'} · ${leaderRow.wins}胜 / ${leaderRow.points}分`
        : '小组积分尚未形成',
      tone: 'amber',
    },
    {
      id: 'bracket',
      label: 'BRACKET SYNC',
      value: `${stats.bracketRoundCount} 轮`,
      detail: stats.bracketRoundCount > 0 ? '淘汰赛路径已接入公开视图' : '淘汰赛路径等待生成',
      tone: 'violet',
    },
    {
      id: 'schedule',
      label: 'MATCH FLOW',
      value: `${stats.progressPercent}%`,
      detail: `${stats.completedMatches}/${stats.totalMatches} 场已完成`,
      tone: 'emerald',
    },
  ];
}
