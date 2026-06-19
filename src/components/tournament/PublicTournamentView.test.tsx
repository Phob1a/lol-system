import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import { useTournamentState } from '@/hooks/useTournamentState';
import { PublicTournamentView } from './PublicTournamentView';

vi.mock('@/hooks/useTournamentState', () => ({
  useTournamentState: vi.fn(),
}));

type State = NonNullable<PublicState>;

function state(): State {
  return {
    tournament: { id: 't1', name: '夏季联赛', kind: 'GROUP_KNOCKOUT', status: 'ACTIVE' },
    matches: [
      {
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
      },
    ],
    standings: [],
    bracket: [],
  };
}

describe('PublicTournamentView', () => {
  it('delegates loaded public state to the arena console', () => {
    vi.mocked(useTournamentState).mockReturnValue({
      state: state(),
      loaded: true,
      refetch: vi.fn(),
    });

    render(<PublicTournamentView />);

    expect(screen.getByText('LOL-SYSTEM / PUBLIC ARENA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '夏季联赛进入公共竞技场' })).toBeInTheDocument();
  });
});
