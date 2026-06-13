import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationDashboard } from './ReservationDashboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReservationDashboard', () => {
  it('shows own scheduled and candidate matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 'tour1',
        scheduled: [{
          id: 'm1',
          version: 1,
          label: 'A1',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: '2026-06-13T12:00:00.000Z',
          status: 'SCHEDULED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't2', name: '蓝队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
        candidates: [{
          id: 'm2',
          version: 2,
          label: 'A2',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: null,
          status: 'SCHEDULED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't3', name: '绿队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
      }),
    }));

    render(<ReservationDashboard />);
    expect(await screen.findByRole('heading', { name: '已预约' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '可预约' })).toBeInTheDocument();
    expect(await screen.findByText('红队 vs 蓝队')).toBeInTheDocument();
    expect(await screen.findByText('红队 vs 绿队')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改时间' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消预约' })).toBeInTheDocument();
  });

  it('can create a reservation from a candidate', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournamentId: 'tour1',
          scheduled: [],
          candidates: [{
            id: 'm2',
            version: 2,
            label: 'A2',
            roundKey: null,
            groupId: 'g1',
            scheduledAt: null,
            status: 'SCHEDULED',
            teamA: { id: 't1', name: '红队' },
            teamB: { id: 't3', name: '绿队' },
            stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
          }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tournamentId: 'tour1', scheduled: [], candidates: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationDashboard />);
    await screen.findByText('红队 vs 绿队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/captain/reservations/m2',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({
      expectedVersion: 2,
      scheduledAt: new Date('2026-06-13T20:00').toISOString(),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/captain/reservations'));
  });

  it('does not show change or clear actions for non-SCHEDULED history rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 'tour1',
        scheduled: [{
          id: 'm1',
          version: 1,
          label: 'A1',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: '2026-06-13T12:00:00.000Z',
          status: 'FINISHED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't2', name: '蓝队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
        candidates: [],
      }),
    }));

    render(<ReservationDashboard />);
    expect(await screen.findByText('红队 vs 蓝队')).toBeInTheDocument();
    expect(screen.getByText('已结束')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '修改时间' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消预约' })).not.toBeInTheDocument();
  });

  it('refreshes after a version conflict', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournamentId: 'tour1',
          scheduled: [{
            id: 'm2',
            version: 2,
            label: 'A2',
            roundKey: null,
            groupId: 'g1',
            scheduledAt: new Date('2026-06-13T12:00').toISOString(),
            status: 'SCHEDULED',
            teamA: { id: 't1', name: '红队' },
            teamB: { id: 't3', name: '绿队' },
            stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
          }],
          candidates: [],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'VERSION_CONFLICT' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournamentId: 'tour1',
          scheduled: [{
            id: 'm2',
            version: 3,
            label: 'A2',
            roundKey: null,
            groupId: 'g1',
            scheduledAt: new Date('2026-06-13T13:00').toISOString(),
            status: 'SCHEDULED',
            teamA: { id: 't1', name: '红队' },
            teamB: { id: 't3', name: '绿队' },
            stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
          }],
          candidates: [],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationDashboard />);
    await screen.findByText('红队 vs 绿队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '修改时间' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/captain/reservations');
    await waitFor(() => expect(screen.getByLabelText('时间')).toHaveValue('2026-06-13T13:00'));
  });
});
