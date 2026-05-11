import type { PrismaClient } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export type BracketSlots = [string, string, string, string, string, string, string, string];

export async function seedBracket(
  db: PrismaClient,
  input: { tournamentId: string; slots: BracketSlots; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'BRACKET_SEEDING') {
    throw new TournamentStateError('WRONG_STATUS', 'tournament must be in BRACKET_SEEDING');
  }
  const unique = new Set(input.slots);
  if (unique.size !== 8) {
    throw new TournamentStateError('DUPLICATE_TEAMS', 'all 8 slots must be distinct teams');
  }

  // Verify every team is in this tournament
  const gTeams = await db.groupTeam.findMany({
    where: { teamId: { in: input.slots }, group: { tournamentId: t.id } },
  });
  if (gTeams.length !== 8) {
    throw new TournamentStateError('INVALID_TEAMS', 'all slots must reference teams in this tournament');
  }

  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'BRACKET_SEEDED',
    payload: { slots: input.slots },
    mutate: async (tx) => {
      // Clear any previous bracket attempt
      await tx.match.deleteMany({
        where: { tournamentId: t.id, phase: { in: ['QF', 'SF', 'FINAL'] } },
      });
      // Create FINAL first so QF/SF can reference it via nextMatchId FK
      const finalM = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'FINAL', format: 'BO5', status: 'SCHEDULED',
          roundIndex: 2, matchIndex: 0,
        },
      });
      const sf0 = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'SF', format: 'BO3', status: 'SCHEDULED',
          roundIndex: 1, matchIndex: 0,
          nextMatchId: finalM.id, nextSide: 'A',
        },
      });
      const sf1 = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'SF', format: 'BO3', status: 'SCHEDULED',
          roundIndex: 1, matchIndex: 1,
          nextMatchId: finalM.id, nextSide: 'B',
        },
      });
      // QF mappings: QF0+QF1 → SF0 (A/B); QF2+QF3 → SF1 (A/B)
      const qfTargets: Array<{ next: string; side: 'A' | 'B'; idx: number }> = [
        { next: sf0.id, side: 'A', idx: 0 },
        { next: sf0.id, side: 'B', idx: 1 },
        { next: sf1.id, side: 'A', idx: 2 },
        { next: sf1.id, side: 'B', idx: 3 },
      ];
      for (const q of qfTargets) {
        await tx.match.create({
          data: {
            tournamentId: t.id, phase: 'QF', format: 'BO3', status: 'SCHEDULED',
            roundIndex: 0, matchIndex: q.idx,
            teamAId: input.slots[q.idx * 2],
            teamBId: input.slots[q.idx * 2 + 1],
            nextMatchId: q.next, nextSide: q.side,
          },
        });
      }
    },
  });
}

export async function lockBracket(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'BRACKET_SEEDING') {
    throw new TournamentStateError('WRONG_STATUS', 'tournament must be in BRACKET_SEEDING');
  }
  const qfs = await db.match.findMany({ where: { tournamentId: t.id, phase: 'QF' } });
  if (qfs.length !== 4 || qfs.some(q => !q.teamAId || !q.teamBId)) {
    throw new TournamentStateError('BRACKET_INCOMPLETE', 'bracket must have all 4 QF matches with teams');
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'BRACKET_LOCKED',
    payload: {},
    mutate: async (tx) => {
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'KNOCKOUT' } });
    },
  });
}
