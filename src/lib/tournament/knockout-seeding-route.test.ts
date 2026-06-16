import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
  closeGroupStageMock,
  confirmKnockoutSeedingMock,
  getKnockoutSeedingDraftMock,
  publishTournamentMock,
  requireAdminMock,
} = vi.hoisted(() => ({
  closeGroupStageMock: vi.fn(),
  confirmKnockoutSeedingMock: vi.fn(),
  getKnockoutSeedingDraftMock: vi.fn(),
  publishTournamentMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/db', () => ({
  prisma: { marker: 'db' },
}));

vi.mock('@/lib/tournament/bracket-service', () => ({
  closeGroupStage: closeGroupStageMock,
}));

vi.mock('@/lib/tournament/knockout-seeding-service', () => ({
  confirmKnockoutSeeding: confirmKnockoutSeedingMock,
  getKnockoutSeedingDraft: getKnockoutSeedingDraftMock,
}));

vi.mock('@/server/tournament-bus', () => ({
  publishTournament: publishTournamentMock,
}));

describe('knockout seeding admin API routes', () => {
  beforeEach(() => {
    vi.resetModules();
    closeGroupStageMock.mockReset();
    confirmKnockoutSeedingMock.mockReset();
    getKnockoutSeedingDraftMock.mockReset();
    publishTournamentMock.mockReset();
    requireAdminMock.mockReset();
  });

  it('GET returns draft and calls service with prisma and tournamentId', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    getKnockoutSeedingDraftMock.mockResolvedValueOnce({ tournamentId: 'tour1', slots: [] });
    const { GET } = await import('@/app/api/tournament/admin/knockout-seeding/route');

    const res = await GET(new Request('http://localhost/api?tournamentId=tour1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: { tournamentId: 'tour1', slots: [] } });
    expect(getKnockoutSeedingDraftMock).toHaveBeenCalledWith({ marker: 'db' }, 'tour1');
  });

  it('GET rejects missing tournamentId with 422', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    const { GET } = await import('@/app/api/tournament/admin/knockout-seeding/route');

    const res = await GET(new Request('http://localhost/api'));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: '缺少 tournamentId' });
    expect(getKnockoutSeedingDraftMock).not.toHaveBeenCalled();
  });

  it('POST confirms slots with actor id and publishes invalidation', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    confirmKnockoutSeedingMock.mockResolvedValueOnce(undefined);
    const { POST } = await import('@/app/api/tournament/admin/knockout-seeding/route');

    const slots = [{ matchId: 'm1', slot: 'A', teamId: 'team1' }];
    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ tournamentId: 'tour1', slots }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(confirmKnockoutSeedingMock).toHaveBeenCalledWith(
      { marker: 'db' },
      { tournamentId: 'tour1', slots, actorUserId: 'admin-user' },
    );
    expect(publishTournamentMock).toHaveBeenCalledWith({ type: 'tournament.invalidated' });
  });

  it('old close-groups route returns 410 after auth without automatic seeding', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    const { POST } = await import('@/app/api/tournament/admin/close-groups/route');

    const res = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ tournamentId: 'tour1' }),
      }),
    );

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: '自动收小组入口已退役，请使用手动淘汰赛排位' });
    expect(closeGroupStageMock).not.toHaveBeenCalled();
    expect(publishTournamentMock).not.toHaveBeenCalled();
  });

  it('old close-groups route returns auth errors before retired response', async () => {
    requireAdminMock.mockResolvedValueOnce({
      error: NextResponse.json({ error: '未登录' }, { status: 401 }),
    });
    const { POST } = await import('@/app/api/tournament/admin/close-groups/route');

    const res = await POST(new Request('http://localhost/api', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(closeGroupStageMock).not.toHaveBeenCalled();
  });
});
