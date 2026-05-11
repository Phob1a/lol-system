import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  createTournament,
  resetTournament,
  getActiveTournament,
  TournamentStateError,
} from './tournament-service';

async function ensureFinishedDraft() {
  // Tests assume a finished draft session exists. Create a minimal one if missing.
  const existing = await db.draftSession.findFirst({ where: { status: 'FINISHED' } });
  if (existing) return;
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
}

describe('tournament-service', () => {
  beforeEach(async () => {
    await db.tournamentEvent.deleteMany();
    await db.tournament.deleteMany();
    await ensureFinishedDraft();
  });

  it('creates a tournament with valid config', async () => {
    const t = await createTournament(db, {
      name: 'Spring 2026', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2,
      actorId: 'admin1',
    });
    expect(t.name).toBe('Spring 2026');
    expect(t.status).toBe('NOT_STARTED');
    expect(t.groups).toHaveLength(4);
    expect(t.groups.map(g => g.letter).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(t.seq).toBe(1);
  });

  it('rejects when advancing × groups != 8', async () => {
    await expect(
      createTournament(db, {
        name: 'Bad', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 3,
        actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('rejects when another tournament is active', async () => {
    await createTournament(db, {
      name: 'A', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    await expect(
      createTournament(db, {
        name: 'B', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('reset archives the current tournament', async () => {
    const t = await createTournament(db, {
      name: 'Spring', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    const archived = await resetTournament(db, { tournamentId: t.id, actorId: 'admin1' });
    expect(archived.status).toBe('FINISHED');
    expect(archived.name.startsWith('[archived] ')).toBe(true);
    // active query now returns null
    expect(await getActiveTournament(db)).toBeNull();
  });
});
