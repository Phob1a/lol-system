import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminState } from '@/hooks/useTournamentState';
import { SetupTab } from './SetupTab';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function state(status = 'REGISTRATION'): NonNullable<AdminState> {
  return {
    tournament: {
      id: 'tour-1',
      name: 'Summer',
      kind: '正赛',
      status,
      teamBudget: 1000,
      config: {
        template: 'group-knockout',
        groupCount: 2,
        teamsPerGroup: 4,
        advancingPerGroup: 2,
        groupBestOf: 1,
        knockoutBestOf: { SF: 3, FINAL: 5 },
      },
    },
    matches: [],
    bracket: [],
    standings: [],
  };
}

describe('SetupTab team budget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('updates team budget from tournament settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tournament: { id: 'tour-1', teamBudget: 1200 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<SetupTab tournamentId="tour-1" state={state()} refetch={refetch} />);

    fireEvent.change(screen.getByLabelText('队伍总费用'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: '保存队伍总费用' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tournament/tour-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamBudget: 1200 }),
    }));
    expect(refetch).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('队伍预算已更新');
  });

  it('locks team budget after drafting starts', () => {
    render(<SetupTab tournamentId="tour-1" state={state('DRAFTING')} refetch={vi.fn()} />);

    expect(screen.getByLabelText('队伍总费用')).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存队伍总费用' })).toBeDisabled();
    expect(screen.getByText(/队伍预算已锁定/)).toBeInTheDocument();
  });
});
