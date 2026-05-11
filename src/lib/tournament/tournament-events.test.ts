import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { appendEvent, ConcurrencyError } from './tournament-events';

async function makeTournament() {
  return db.tournament.create({
    data: { name: `T-${Date.now()}-${Math.random()}`, groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2 },
  });
}

describe('appendEvent', () => {
  beforeEach(async () => {
    // tests are isolated by their own tournament rows; no global cleanup needed
  });

  it('writes event with seq = current+1 and bumps Tournament.seq', async () => {
    const t = await makeTournament();
    const after = await appendEvent(db, {
      tournamentId: t.id,
      expectedSeq: 0,
      actorId: 'tester',
      type: 'TOURNAMENT_CREATED',
      payload: { name: t.name },
      mutate: async () => { /* no extra writes */ },
    });
    expect(after.seq).toBe(1);
    const ev = await db.tournamentEvent.findFirst({ where: { tournamentId: t.id } });
    expect(ev?.seq).toBe(1);
    expect(ev?.type).toBe('TOURNAMENT_CREATED');
  });

  it('rejects when expectedSeq is stale (concurrency)', async () => {
    const t = await makeTournament();
    await appendEvent(db, {
      tournamentId: t.id, expectedSeq: 0, actorId: 'a',
      type: 'TOURNAMENT_CREATED', payload: {}, mutate: async () => {},
    });
    // Second call with the same expectedSeq should be rejected
    await expect(
      appendEvent(db, {
        tournamentId: t.id, expectedSeq: 0, actorId: 'b',
        type: 'GROUPS_DEFINED', payload: {}, mutate: async () => {},
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('runs mutate inside the transaction (rolls back on error)', async () => {
    const t = await makeTournament();
    await expect(
      appendEvent(db, {
        tournamentId: t.id, expectedSeq: 0, actorId: 'a',
        type: 'TOURNAMENT_CREATED', payload: {},
        mutate: async () => { throw new Error('boom'); },
      }),
    ).rejects.toThrow('boom');
    const tournament = await db.tournament.findUnique({ where: { id: t.id } });
    expect(tournament?.seq).toBe(0); // unchanged
    const evCount = await db.tournamentEvent.count({ where: { tournamentId: t.id } });
    expect(evCount).toBe(0);
  });
});
