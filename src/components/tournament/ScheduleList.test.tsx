import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import { ScheduleList } from './ScheduleList';

type Match = NonNullable<PublicState>['matches'][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    label: 'A1',
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

describe('ScheduleList', () => {
  it('hides unscheduled matches on the public schedule', () => {
    render(
      <ScheduleList
        matches={[
          match({ id: 'scheduled', teamA: { id: 'ta', name: '已排期队伍' } }),
          match({
            id: 'unscheduled',
            scheduledAt: null,
            teamA: { id: 'ua', name: '未排期队伍' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('已排期队伍')).toBeInTheDocument();
    expect(screen.queryByText('未排期队伍')).not.toBeInTheDocument();
    expect(screen.queryByText(/时间待定/)).not.toBeInTheDocument();
  });

  it('shows a specific empty state when generated matches have not been scheduled', () => {
    render(
      <ScheduleList
        matches={[
          match({
            id: 'unscheduled',
            scheduledAt: null,
            teamA: { id: 'ua', name: '未排期队伍' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('暂无已排期比赛')).toBeInTheDocument();
    expect(screen.queryByText('暂无赛程')).not.toBeInTheDocument();
  });
});
