import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminState } from '@/hooks/useTournamentState';
import { GroupsTab } from './GroupsTab';

const teams = [
  { id: 't1', name: 'Alpha' },
  { id: 't2', name: 'Bravo' },
  { id: 't3', name: 'Charlie' },
  { id: 't4', name: 'Delta' },
];

function stateWithGroups(groupTeams: Array<Record<string, string>> = [{}, {}]): AdminState {
  return {
    tournament: {
      id: 'tour-1',
      name: 'Summer',
      kind: 'STANDARD',
      status: 'SETUP',
      config: {
        template: 'group-knockout',
        groupCount: 2,
        teamsPerGroup: 2,
        advancingPerGroup: 2,
        groupBestOf: 1,
        knockoutBestOf: { SEMIFINAL: 3, FINAL: 5 },
      },
    },
    matches: [],
    bracket: [],
    standings: groupTeams.map((group, index) => ({
      groupId: `group-${index + 1}`,
      name: index === 0 ? 'A' : 'B',
      teams: group,
      rows: [],
    })),
  };
}

describe('GroupsTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders an unassigned team pool and fixed group slots without dropdowns in setup', () => {
    render(<GroupsTab teams={teams} state={stateWithGroups()} refetch={vi.fn()} />);

    expect(screen.getByTestId('group-team-pool')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^group-slot-\d-\d$/)).toHaveLength(4);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    const pool = screen.getByTestId('group-team-pool');
    expect(within(pool).getByText('Alpha')).toBeInTheDocument();
    expect(within(pool).getByText('Bravo')).toBeInTheDocument();
    expect(within(pool).getByText('Charlie')).toBeInTheDocument();
    expect(within(pool).getByText('Delta')).toBeInTheDocument();
  });

  it('renders assigned teams in slots and keeps the existing save payload shape', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn(async () => {});

    render(
      <GroupsTab
        teams={teams}
        state={stateWithGroups([{ t1: 'Alpha' }, { t3: 'Charlie' }])}
        refetch={refetch}
      />,
    );

    expect(within(screen.getByTestId('group-slot-0-0')).getByText('Alpha')).toBeInTheDocument();
    expect(within(screen.getByTestId('group-slot-1-0')).getByText('Charlie')).toBeInTheDocument();
    expect(within(screen.getByTestId('group-team-pool')).getByText('Bravo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /保存分组/ }));

    expect(fetchMock).toHaveBeenCalledWith('/api/tournament/admin/groups', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tournamentId: 'tour-1',
        assignments: [
          { groupId: 'group-1', teamIds: ['t1'] },
          { groupId: 'group-2', teamIds: ['t3'] },
        ],
      }),
    });
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});
