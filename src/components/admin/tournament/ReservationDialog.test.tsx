import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationDialog } from './ReservationDialog';

const candidates = [
  {
    id: 'm1',
    version: 3,
    label: 'A1',
    roundKey: null,
    groupId: 'g1',
    scheduledAt: null,
    status: 'SCHEDULED',
    teamA: { id: 't1', name: '红队' },
    teamB: { id: 't2', name: '蓝队' },
    stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
  },
];

describe('ReservationDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits selected match and datetime to admin reservation API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: candidates }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<ReservationDialog open onClose={vi.fn()} tournamentId="tour1" refetch={refetch} />);

    await screen.findByText('红队 vs 蓝队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/tournament/admin/reservations/m1',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({
      expectedVersion: 3,
      scheduledAt: new Date('2026-06-13T20:00').toISOString(),
    });
    expect(refetch).toHaveBeenCalled();
  });

  it('closes after successful save even when refetch fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: candidates }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();

    render(
      <ReservationDialog
        open
        onClose={onClose}
        tournamentId="tour1"
        refetch={vi.fn().mockRejectedValue(new Error('refetch failed'))}
      />,
    );

    await screen.findByText('红队 vs 蓝队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('closes after version conflict refresh to avoid resubmitting a stale version', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: candidates }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'VERSION_CONFLICT' }) });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<ReservationDialog open onClose={onClose} tournamentId="tour1" refetch={refetch} />);

    await screen.findByText('红队 vs 蓝队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when candidates are empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    }));

    render(<ReservationDialog open onClose={vi.fn()} tournamentId="tour1" refetch={vi.fn()} />);

    expect(await screen.findByText('暂无可预约比赛')).toBeInTheDocument();
  });
});
