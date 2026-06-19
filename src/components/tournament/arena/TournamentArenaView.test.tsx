import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import { TournamentArenaView } from './TournamentArenaView';

type State = NonNullable<PublicState>;
type Match = State['matches'][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    label: '小组赛 R1',
    roundKey: 'GROUP',
    bestOf: 1,
    scheduledAt: '2026-07-01T12:00:00.000Z',
    status: 'SCHEDULED',
    isWalkover: false,
    teamA: { id: 'ta', name: '蓝队' },
    teamB: { id: 'tb', name: '红队' },
    winnerTeamId: null,
    groupId: 'g1',
    ...overrides,
  };
}

function state(): State {
  return {
    tournament: { id: 't1', name: '夏季联赛', kind: 'GROUP_KNOCKOUT', status: 'ACTIVE' },
    matches: [match()],
    standings: [
      {
        groupId: 'g1',
        name: 'A组',
        teams: { ta: '蓝队', tb: '红队' },
        rows: [
          { teamId: 'ta', played: 2, wins: 2, losses: 0, points: 6, rank: 1, tied: false },
          { teamId: 'tb', played: 2, wins: 1, losses: 1, points: 3, rank: 2, tied: false },
        ],
      },
    ],
    bracket: [
      {
        roundKey: 'SEMIFINAL',
        matches: [
          {
            id: 'b1',
            label: '半决赛 1',
            teamAId: 'ta',
            teamBId: 'tb',
            winnerTeamId: null,
            status: 'SCHEDULED',
          },
        ],
      },
    ],
  };
}

describe('TournamentArenaView', () => {
  it('renders the arena loading state', () => {
    render(<TournamentArenaView loaded={false} state={null} />);

    expect(screen.getByText('赛事信号加载中...')).toBeInTheDocument();
  });

  it('renders the public empty state when no tournament exists', () => {
    render(<TournamentArenaView loaded state={null} />);

    expect(screen.getByRole('heading', { name: '暂未创建赛事' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });

  it('renders the Tech Arena Console shell with existing sections', () => {
    render(<TournamentArenaView loaded state={state()} />);

    expect(screen.getByText('LOL-SYSTEM / PUBLIC ARENA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '夏季联赛进入公共竞技场' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /观看下一场/ })).toHaveAttribute(
      'href',
      '/tournament/match/m1',
    );
    expect(screen.getByRole('tab', { name: '赛程' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '小组赛' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '对阵图' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '数据榜' })).toBeInTheDocument();
  });
});
