export type HomeSeasonStatus =
  | 'SETUP'
  | 'REGISTRATION'
  | 'ROSTER_LOCKED'
  | 'DRAFTING'
  | 'COMPLETED'
  | 'ARCHIVED';

export type HomeTournamentStatus = 'SETUP' | 'GROUP_STAGE' | 'KNOCKOUT' | 'FINISHED';

const TOURNAMENT_STATUS_TEXT: Record<HomeTournamentStatus, string> = {
  SETUP: '赛事筹备中',
  GROUP_STAGE: '小组赛进行中',
  KNOCKOUT: '淘汰赛进行中',
  FINISHED: '赛事已结束',
};

export type PublicHomeContext = {
  season: { name: string; status: HomeSeasonStatus } | null;
  tournament: { status: HomeTournamentStatus } | null;
};

export type HomeEntry = {
  id: 'register' | 'tournament' | 'leaderboard' | 'live' | 'login';
  title: string;
  description: string;
  href: string;
  emphasis: 'primary' | 'normal' | 'muted';
};

const ENTRY: Record<HomeEntry['id'], Omit<HomeEntry, 'emphasis'>> = {
  register: {
    id: 'register',
    title: '赛事报名',
    description: '提交参赛信息，报名开放时优先从这里进入。',
    href: '/register',
  },
  tournament: {
    id: 'tournament',
    title: '赛事赛程',
    description: '查看赛程、积分、小组赛和淘汰赛对阵。',
    href: '/tournament',
  },
  leaderboard: {
    id: 'leaderboard',
    title: '选手数据榜',
    description: '进入赛事页的数据榜，查看 KDA、MVP 和场均数据。',
    href: '/tournament',
  },
  live: {
    id: 'live',
    title: '选秀直播',
    description: '观看选秀进程、队伍阵容和实时出手。',
    href: '/live',
  },
  login: {
    id: 'login',
    title: '登录后台',
    description: '管理员和队长从这里进入工作台。',
    href: '/login',
  },
};

function entry(id: HomeEntry['id'], emphasis: HomeEntry['emphasis'] = 'normal'): HomeEntry {
  return { ...ENTRY[id], emphasis };
}

export function buildHomeEntries(context: PublicHomeContext): HomeEntry[] {
  if (!context.season) return [entry('login', 'primary')];

  switch (context.season.status) {
    case 'REGISTRATION':
      return [
        entry('register', 'primary'),
        entry('tournament'),
        entry('leaderboard'),
        entry('live'),
        entry('login', 'muted'),
      ];
    case 'DRAFTING':
      return [
        entry('live', 'primary'),
        entry('tournament'),
        entry('leaderboard'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'COMPLETED':
    case 'ARCHIVED':
      return [
        entry('tournament', 'primary'),
        entry('leaderboard'),
        entry('live'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'ROSTER_LOCKED':
      return [
        entry('tournament', 'primary'),
        entry('live'),
        entry('leaderboard'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'SETUP':
    default:
      return [
        entry('tournament', 'primary'),
        entry('register'),
        entry('live'),
        entry('login', 'muted'),
      ];
  }
}

export function getSeasonStatusText(context: PublicHomeContext): {
  headline: string;
  description: string;
} {
  if (!context.season) {
    return {
      headline: '暂无开放赛季',
      description: '当前没有活跃赛季。管理员可以登录后台创建赛季。',
    };
  }

  const name = context.season.name;
  const tournament = context.tournament;
  const tournamentText = tournament
    ? TOURNAMENT_STATUS_TEXT[tournament.status]
    : '赛事暂未创建';

  switch (context.season.status) {
    case 'REGISTRATION':
      return { headline: `${name}报名开放中`, description: tournamentText };
    case 'ROSTER_LOCKED':
      return { headline: `${name}报名已截止`, description: tournamentText };
    case 'DRAFTING':
      return { headline: `${name}选秀进行中`, description: tournamentText };
    case 'COMPLETED':
      return { headline: `${name}已完成`, description: tournamentText };
    case 'ARCHIVED':
      return { headline: `${name}已归档`, description: tournamentText };
    case 'SETUP':
    default:
      return { headline: `${name}准备中`, description: tournamentText };
  }
}
