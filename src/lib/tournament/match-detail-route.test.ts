import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireAdminMock, findUniqueMock, findManyMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    match: { findUnique: findUniqueMock },
    tournamentTeam: { findMany: findManyMock },
  },
}));

describe('admin match detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminMock.mockReset();
    findUniqueMock.mockReset();
    findManyMock.mockReset();
  });

  it('returns complete game detail fields for editing existing games', async () => {
    requireAdminMock.mockResolvedValueOnce({ session: { user: { id: 'admin', role: 'ADMIN' } } });
    findUniqueMock.mockResolvedValueOnce({
      id: 'match-1',
      version: 7,
      bestOf: 3,
      status: 'SCHEDULED',
      tournamentId: 'tour-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerTeamId: null,
      games: [
        {
          id: 'game-1',
          index: 1,
          isDraft: false,
          winnerTeamId: 'team-a',
          blueTeamId: 'team-b',
          durationSeconds: 1815,
          mvpRegistrationId: 'reg-a',
          bans: [
            { teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 },
            { teamId: 'team-a', type: 'PICK', championId: 'Garen', order: 2 },
          ],
          playerStats: [
            {
              teamId: 'team-a',
              registrationId: 'reg-a',
              championId: 'Garen',
              kills: 10,
              deaths: 1,
              assists: 8,
              cs: 220,
              damage: 30000,
              gold: 14000,
            },
          ],
          _count: { bans: 2, playerStats: 1 },
        },
      ],
    });
    findManyMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/tournament/admin/matches/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api'), { params: Promise.resolve({ id: 'match-1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match.games[0]).toEqual({
      id: 'game-1',
      index: 1,
      isDraft: false,
      winnerTeamId: 'team-a',
      hasBans: true,
      hasStats: false,
      blueTeamId: 'team-b',
      durationSeconds: 1815,
      mvpRegistrationId: 'reg-a',
      bans: [
        { teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 },
        { teamId: 'team-a', type: 'PICK', championId: 'Garen', order: 2 },
      ],
      playerStats: [
        {
          teamId: 'team-a',
          registrationId: 'reg-a',
          championId: 'Garen',
          kills: 10,
          deaths: 1,
          assists: 8,
          cs: 220,
          damage: 30000,
          gold: 14000,
        },
      ],
    });
  });

  it('returns empty arrays and null scalars for games without detail', async () => {
    requireAdminMock.mockResolvedValueOnce({ session: { user: { id: 'admin', role: 'ADMIN' } } });
    findUniqueMock.mockResolvedValueOnce({
      id: 'match-1',
      version: 1,
      bestOf: 1,
      status: 'SCHEDULED',
      tournamentId: 'tour-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerTeamId: null,
      games: [
        {
          id: 'game-empty',
          index: 1,
          isDraft: true,
          winnerTeamId: null,
          blueTeamId: null,
          durationSeconds: null,
          mvpRegistrationId: null,
          bans: [],
          playerStats: [],
          _count: { bans: 0, playerStats: 0 },
        },
      ],
    });
    findManyMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/tournament/admin/matches/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api'), { params: Promise.resolve({ id: 'match-1' }) });

    expect(res.status).toBe(200);
    const game = (await res.json()).match.games[0];
    expect(game.blueTeamId).toBeNull();
    expect(game.durationSeconds).toBeNull();
    expect(game.mvpRegistrationId).toBeNull();
    expect(game.bans).toEqual([]);
    expect(game.playerStats).toEqual([]);
  });
});
