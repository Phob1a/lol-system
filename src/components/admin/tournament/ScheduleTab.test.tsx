import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminState } from '@/hooks/useTournamentState';
import { ScheduleTab } from './ScheduleTab';

function state(): AdminState {
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

describe('ScheduleTab', () => {
  it('does not expose the retired planner entry while batch scheduling is disabled', () => {
    render(<ScheduleTab teams={[]} state={state()} refetch={vi.fn()} seasonId="season-1" />);

    expect(screen.queryByRole('button', { name: '排期' })).not.toBeInTheDocument();
  });
});
