import { expect, it, describe } from 'vitest';
import { TournamentError } from './errors';
import { toResponse } from './route-errors';

describe('toResponse', () => {
  it('INVALID_CONFIG → 422', async () => {
    const res = toResponse(new TournamentError('INVALID_CONFIG', '出线总数非 2 的幂'));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('INVALID_CONFIG');
  });

  it('INVALID_STATE → 422', async () => {
    const res = toResponse(new TournamentError('INVALID_STATE', 'bad state'));
    expect(res.status).toBe(422);
  });

  it('TOURNAMENT_NOT_FOUND → 404', async () => {
    const res = toResponse(new TournamentError('TOURNAMENT_NOT_FOUND', 'not found'));
    expect(res.status).toBe(404);
  });

  it('VERSION_CONFLICT → 409', async () => {
    const res = toResponse(new TournamentError('VERSION_CONFLICT', 'conflict'));
    expect(res.status).toBe(409);
  });

  it('FORBIDDEN → 403', async () => {
    const res = toResponse(new TournamentError('FORBIDDEN', '无权操作该比赛'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('non-TournamentError → 500', async () => {
    const res = toResponse(new Error('unknown'));
    expect(res.status).toBe(500);
  });
});
