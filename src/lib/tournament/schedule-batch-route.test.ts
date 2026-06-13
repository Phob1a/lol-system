import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: vi.fn(async () => ({
    session: { user: { id: 'admin-user', role: 'ADMIN' } },
  })),
}));

describe('retired schedule batch route', () => {
  it('returns 410 and does not expose a writable scheduling path', async () => {
    const { POST } = await import('@/app/api/tournament/admin/schedule/batch/route');

    const res = await POST();

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe('BATCH_SCHEDULE_RETIRED');
  });
});
