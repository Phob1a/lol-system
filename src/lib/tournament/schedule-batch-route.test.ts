import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
}));

describe('retired schedule batch route', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  it('returns auth guard errors before the retired response', async () => {
    requireAdminMock.mockResolvedValueOnce({
      error: NextResponse.json({ error: '未登录' }, { status: 401 }),
    });
    const { POST } = await import('@/app/api/tournament/admin/schedule/batch/route');

    const res = await POST();

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(401);
  });

  it('returns 410 and does not expose a writable scheduling path', async () => {
    requireAdminMock.mockResolvedValueOnce({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
    });
    const { POST } = await import('@/app/api/tournament/admin/schedule/batch/route');

    const res = await POST();

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe('BATCH_SCHEDULE_RETIRED');
  });
});
