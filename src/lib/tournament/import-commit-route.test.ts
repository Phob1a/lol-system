import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── hoisted mocks (must be before any imports that reference them) ────────────

const { requireAdminMock, commitImportMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  commitImportMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

vi.mock('@/lib/tournament/import-service', () => ({
  commitImport: commitImportMock,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const VALID_BODY = {
  matchId: 'match-1',
  expectedVersion: 3,
  gameIndex: 1,
  blueTeamId: 'team-a',
  mappings: Array.from({ length: 10 }, (_, i) => ({
    capturedParticipantId: i + 1,
    registrationId: `reg-${i}`,
  })),
};

function makeReq(body: unknown = VALID_BODY): NextRequest {
  return new NextRequest('http://localhost/api/tournament/admin/imports/imp-1/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/tournament/admin/imports/[id]/commit', () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminMock.mockReset();
    commitImportMock.mockReset();
  });

  it('unauthenticated request → 401 guard error', async () => {
    requireAdminMock.mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: '未登录' }), { status: 401 }),
    });

    const { POST } = await import(
      '@/app/api/tournament/admin/imports/[id]/commit/route'
    );
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'imp-1' }) });

    // requireAdmin returned an error response; the route must return it as-is
    expect(res.status).toBe(401);
    requireAdminMock.mockReset();
  });

  it('non-admin session → 403 guard error', async () => {
    requireAdminMock.mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403 }),
    });

    const { POST } = await import(
      '@/app/api/tournament/admin/imports/[id]/commit/route'
    );
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'imp-1' }) });

    expect(res.status).toBe(403);
  });

  it('admin session → commitImport called with actorUserId from session', async () => {
    const ACTOR_ID = 'admin-user-42';
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: ACTOR_ID, role: 'ADMIN' } },
    });
    commitImportMock.mockResolvedValueOnce({ gameId: 'game-xyz' });

    const { POST } = await import(
      '@/app/api/tournament/admin/imports/[id]/commit/route'
    );
    const res = await POST(makeReq(), { params: Promise.resolve({ id: 'imp-1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.gameId).toBe('game-xyz');

    // actorUserId is the 3rd argument to commitImport
    expect(commitImportMock).toHaveBeenCalledWith(
      expect.anything(), // prisma
      'imp-1',           // import id from route params
      expect.objectContaining({ matchId: 'match-1' }), // parsed body
      ACTOR_ID,          // actorUserId from session
    );
  });
});
