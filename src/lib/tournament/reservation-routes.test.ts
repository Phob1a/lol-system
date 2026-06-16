import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCaptainReservationStateMock,
  listReservableMatchesMock,
  publishTournamentMock,
  requireAdminMock,
  requireCaptainMock,
  reserveMatchMock,
} = vi.hoisted(() => ({
  listCaptainReservationStateMock: vi.fn(),
  listReservableMatchesMock: vi.fn(),
  publishTournamentMock: vi.fn(),
  requireAdminMock: vi.fn(),
  requireCaptainMock: vi.fn(),
  reserveMatchMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
  requireCaptain: requireCaptainMock,
}));

vi.mock('@/lib/db', () => ({
  prisma: { marker: 'db' },
}));

vi.mock('@/lib/tournament/reservation-service', () => ({
  listCaptainReservationState: listCaptainReservationStateMock,
  listReservableMatches: listReservableMatchesMock,
  reserveMatch: reserveMatchMock,
}));

vi.mock('@/server/tournament-bus', () => ({
  publishTournament: publishTournamentMock,
}));

describe('reservation API routes', () => {
  beforeEach(() => {
    listCaptainReservationStateMock.mockReset();
    listReservableMatchesMock.mockReset();
    publishTournamentMock.mockReset();
    requireAdminMock.mockReset();
    requireCaptainMock.mockReset();
    reserveMatchMock.mockReset();
  });

  it('admin candidates route parses tournamentId and returns matches', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    listReservableMatchesMock.mockResolvedValueOnce([{ id: 'm1' }]);
    const { GET } = await import('@/app/api/tournament/admin/reservations/candidates/route');

    const res = await GET(new Request('http://localhost/api?tournamentId=tour1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [{ id: 'm1' }] });
    expect(listReservableMatchesMock).toHaveBeenCalledWith(
      { marker: 'db' },
      { tournamentId: 'tour1', actor: { role: 'ADMIN' } },
    );
  });

  it('admin reservation route writes through reserveMatch and publishes invalidation', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    reserveMatchMock.mockResolvedValueOnce(undefined);
    const { PATCH } = await import('@/app/api/tournament/admin/reservations/[matchId]/route');

    const res = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: 2,
          scheduledAt: '2026-06-13T12:30:00.000Z',
        }),
      }),
      { params: Promise.resolve({ matchId: 'm1' }) },
    );

    expect(res.status).toBe(200);
    expect(reserveMatchMock).toHaveBeenCalledWith(
      { marker: 'db' },
      expect.objectContaining({
        matchId: 'm1',
        expectedVersion: 2,
        actorUserId: 'admin-user',
        actor: { role: 'ADMIN' },
      }),
    );
    expect(publishTournamentMock).toHaveBeenCalledWith({ type: 'tournament.invalidated' });
  });

  it('captain state route resolves reservations for the captain team', async () => {
    requireCaptainMock.mockResolvedValueOnce({
      session: { user: { id: 'captain-user', role: 'CAPTAIN', teamId: 'team1' } },
    });
    listCaptainReservationStateMock.mockResolvedValueOnce({
      tournamentId: 'tour1',
      scheduled: [],
      candidates: [],
    });
    const { GET } = await import('@/app/api/captain/reservations/route');

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournamentId: 'tour1', scheduled: [], candidates: [] });
    expect(listCaptainReservationStateMock).toHaveBeenCalledWith({ marker: 'db' }, { teamId: 'team1' });
  });

  it('captain reservation route writes with the captain actor', async () => {
    requireCaptainMock.mockResolvedValueOnce({
      session: { user: { id: 'captain-user', role: 'CAPTAIN', teamId: 'team1' } },
    });
    reserveMatchMock.mockResolvedValueOnce(undefined);
    const { PATCH } = await import('@/app/api/captain/reservations/[matchId]/route');

    const res = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: 3, scheduledAt: null }),
      }),
      { params: Promise.resolve({ matchId: 'm2' }) },
    );

    expect(res.status).toBe(200);
    expect(reserveMatchMock).toHaveBeenCalledWith(
      { marker: 'db' },
      {
        matchId: 'm2',
        expectedVersion: 3,
        scheduledAt: null,
        actorUserId: 'captain-user',
        actor: { role: 'CAPTAIN', teamId: 'team1' },
      },
    );
    expect(publishTournamentMock).toHaveBeenCalledWith({ type: 'tournament.invalidated' });
  });

  it('reservation patch routes reject malformed payloads with 422', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    const { PATCH } = await import('@/app/api/tournament/admin/reservations/[matchId]/route');

    const res = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        body: JSON.stringify({ scheduledAt: null }),
      }),
      { params: Promise.resolve({ matchId: 'm1' }) },
    );

    expect(res.status).toBe(422);
    expect(reserveMatchMock).not.toHaveBeenCalled();
  });
});
