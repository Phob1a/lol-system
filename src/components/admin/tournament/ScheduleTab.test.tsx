import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminState } from '@/hooks/useTournamentState';
import { ScheduleTab } from './ScheduleTab';

function state(): NonNullable<AdminState> {
  return {
    tournament: {
      id: 'tour-1',
      name: 'Summer',
      kind: 'STANDARD',
      status: 'GROUP_STAGE',
      config: {
        template: 'group-knockout',
        groupCount: 2,
        teamsPerGroup: 2,
        advancingPerGroup: 2,
        groupBestOf: 1,
        knockoutBestOf: { SEMIFINAL: 3, FINAL: 5 },
      },
    },
    standings: [],
    bracket: [],
    matches: [],
  };
}

function match(
  overrides: Partial<NonNullable<AdminState>['matches'][number]>,
): NonNullable<AdminState>['matches'][number] {
  return {
    id: 'match-1',
    version: 0,
    label: 'A1',
    roundKey: null,
    groupId: 'group-1',
    scheduledAt: '2026-06-13T12:00:00.000Z',
    status: 'SCHEDULED',
    bestOf: 1,
    isWalkover: false,
    winnerTeamId: null,
    teamA: { id: 'team-a', name: '红队' },
    teamB: { id: 'team-b', name: '蓝队' },
    games: [],
    ...overrides,
  };
}

describe('ScheduleTab', () => {
  it('does not expose the retired planner entry while batch scheduling is disabled', () => {
    render(<ScheduleTab teams={[]} state={state()} refetch={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '排期' })).not.toBeInTheDocument();
  });

  it('shows 创建预约 and 自定义比赛 buttons in GROUP_STAGE', () => {
    render(<ScheduleTab teams={[]} state={state()} refetch={vi.fn()} />);

    expect(screen.getByRole('button', { name: /创建预约/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /自定义比赛/ })).toBeInTheDocument();
  });

  it('shows 创建预约 and 自定义比赛 buttons in KNOCKOUT', () => {
    const s = state();
    s.tournament!.status = 'KNOCKOUT';
    render(<ScheduleTab teams={[]} state={s} refetch={vi.fn()} />);

    expect(screen.getByRole('button', { name: /创建预约/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /自定义比赛/ })).toBeInTheDocument();
  });

  it('hides entry buttons in pre-bracket states (e.g. GROUPING)', () => {
    const s = state();
    s.tournament!.status = 'GROUPING';
    render(<ScheduleTab teams={[]} state={s} refetch={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /创建预约/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自定义比赛/ })).not.toBeInTheDocument();
  });

  it('hides entry buttons in SETUP', () => {
    const s = state();
    s.tournament!.status = 'SETUP';
    render(<ScheduleTab teams={[]} state={s} refetch={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /创建预约/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自定义比赛/ })).not.toBeInTheDocument();
  });

  it('shows only reserved matches in the schedule table', () => {
    const s = state();
    s.matches = [
      match({ id: 'scheduled', scheduledAt: '2026-06-13T12:00:00.000Z' }),
      match({
        id: 'unscheduled',
        scheduledAt: null,
        teamA: { id: 'team-c', name: '绿队' },
        teamB: { id: 'team-d', name: '黄队' },
      }),
    ];

    render(<ScheduleTab teams={[]} state={s} refetch={vi.fn()} />);

    expect(screen.getByText('红队')).toBeInTheDocument();
    expect(screen.queryByText('绿队')).not.toBeInTheDocument();
  });

  it('shows reservation empty state when no matches are reserved', () => {
    render(<ScheduleTab teams={[]} state={state()} refetch={vi.fn()} />);

    expect(screen.getByText('暂无已预约比赛，可点击创建预约')).toBeInTheDocument();
  });
});
