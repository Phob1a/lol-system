import type { PrismaClient, Prisma, Match } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';
import {
  computeSeriesScore,
  isSeriesComplete,
  seriesWinner,
  winsNeeded,
} from './series-format';

interface MatchHandle {
  tournamentId: string;
  matchId: string;
  actorId: string;
}

async function loadMatch(tx: Prisma.TransactionClient | PrismaClient, matchId: string) {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    include: { games: { orderBy: { gameNumber: 'asc' } } },
  });
  if (!m) throw new TournamentStateError('NOT_FOUND', 'match not found');
  return m;
}

export async function scheduleMatch(
  db: PrismaClient,
  input: MatchHandle & { scheduledAt: Date },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (m.status === 'FINISHED' || m.status === 'WALKOVER') {
    throw new TournamentStateError('ALREADY_FINISHED', 'cannot reschedule a finished match');
  }
  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: m.scheduledAt ? 'MATCH_RESCHEDULED' : 'MATCH_SCHEDULED',
    payload: { matchId: m.id, scheduledAt: input.scheduledAt.toISOString() },
    mutate: async (tx) => {
      await tx.match.update({
        where: { id: m.id },
        data: { scheduledAt: input.scheduledAt },
      });
    },
  });
}

export async function recordGame(
  db: PrismaClient,
  input: MatchHandle & { winnerTeamId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);

  if (m.status === 'FINISHED' || m.status === 'WALKOVER' || m.status === 'CANCELLED') {
    throw new TournamentStateError('NOT_RECORDABLE', `match status is ${m.status}`);
  }
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  if (input.winnerTeamId !== m.teamAId && input.winnerTeamId !== m.teamBId) {
    throw new TournamentStateError('INVALID_WINNER', 'winner must be one of the two teams');
  }

  const nextGameNumber = m.games.length + 1;
  const projectedGames = [...m.games, { winnerTeamId: input.winnerTeamId }];
  const score = computeSeriesScore(projectedGames, m.teamAId, m.teamBId);
  const finishedNow = isSeriesComplete(m.format, score);
  const newStatus = finishedNow ? 'FINISHED' : 'IN_PROGRESS';
  const newWinner = finishedNow
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: finishedNow ? 'MATCH_FINISHED' : 'GAME_RECORDED',
    payload: { matchId: m.id, gameNumber: nextGameNumber, winnerTeamId: input.winnerTeamId },
    mutate: async (tx) => {
      await tx.matchGame.create({
        data: {
          matchId: m.id,
          gameNumber: nextGameNumber,
          winnerTeamId: input.winnerTeamId,
        },
      });
      await tx.match.update({
        where: { id: m.id },
        data: { status: newStatus, winnerTeamId: newWinner ?? undefined },
      });
      if (finishedNow) {
        await advanceKnockoutIfApplicable(tx, m as Match, newWinner!);
      }
    },
  });
}

export async function revokeLastGame(
  db: PrismaClient,
  input: MatchHandle,
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (m.games.length === 0) {
    throw new TournamentStateError('NO_GAMES', 'no games to revoke');
  }

  const last = m.games[m.games.length - 1];
  const wasFinished = m.status === 'FINISHED';

  // If this match was finished AND winner was already advanced to a downstream
  // knockout match that has games recorded, block the revoke.
  if (wasFinished && m.nextMatchId) {
    const downstream = await db.match.findUnique({
      where: { id: m.nextMatchId },
      include: { games: true },
    });
    if (downstream && downstream.games.length > 0) {
      throw new TournamentStateError(
        'DOWNSTREAM_BLOCKED',
        `cannot revoke: downstream match ${downstream.id} has recorded games — revoke it first`,
      );
    }
  }

  // Recompute status after deletion
  const remaining = m.games.slice(0, -1);
  const score = m.teamAId && m.teamBId
    ? computeSeriesScore(remaining, m.teamAId, m.teamBId)
    : { a: 0, b: 0 };
  const finishedAfter = m.teamAId && m.teamBId
    ? isSeriesComplete(m.format, score)
    : false;
  const newStatus = finishedAfter
    ? 'FINISHED'
    : remaining.length === 0 ? 'SCHEDULED' : 'IN_PROGRESS';
  const newWinner = finishedAfter && m.teamAId && m.teamBId
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'GAME_REVOKED',
    payload: { matchId: m.id, gameNumber: last.gameNumber },
    mutate: async (tx) => {
      await tx.matchGame.delete({ where: { id: last.id } });
      await tx.match.update({
        where: { id: m.id },
        data: { status: newStatus, winnerTeamId: newWinner },
      });
      if (wasFinished && !finishedAfter && m.nextMatchId && m.nextSide) {
        // Clear downstream slot
        await tx.match.update({
          where: { id: m.nextMatchId },
          data: m.nextSide === 'A' ? { teamAId: null } : { teamBId: null },
        });
      }
    },
  });
}

export async function declareWalkover(
  db: PrismaClient,
  input: MatchHandle & { winnerTeamId: string; note?: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  if (input.winnerTeamId !== m.teamAId && input.winnerTeamId !== m.teamBId) {
    throw new TournamentStateError('INVALID_WINNER', 'winner must be one of the two teams');
  }
  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCH_WALKOVER',
    payload: { matchId: m.id, winnerTeamId: input.winnerTeamId, note: input.note ?? null },
    mutate: async (tx) => {
      await tx.match.update({
        where: { id: m.id },
        data: {
          status: 'WALKOVER',
          winnerTeamId: input.winnerTeamId,
          walkoverNote: input.note ?? null,
        },
      });
      await advanceKnockoutIfApplicable(tx, m as Match, input.winnerTeamId);
    },
  });
}

/**
 * Edit a finished match's games array wholesale. Used for changing the result.
 * Blocks if downstream already has games recorded.
 */
export async function editMatchGames(
  db: PrismaClient,
  input: MatchHandle & { games: Array<{ winnerTeamId: string }> },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  for (const g of input.games) {
    if (g.winnerTeamId !== m.teamAId && g.winnerTeamId !== m.teamBId) {
      throw new TournamentStateError('INVALID_WINNER', 'every game winner must be one of the two teams');
    }
  }
  if (input.games.length > 0) {
    const need = winsNeeded(m.format);
    const score = computeSeriesScore(input.games, m.teamAId, m.teamBId);
    if (score.a > need || score.b > need) {
      throw new TournamentStateError('TOO_MANY_GAMES', 'games exceed format limit');
    }
  }

  // Downstream-blocking check
  if (m.nextMatchId) {
    const downstream = await db.match.findUnique({
      where: { id: m.nextMatchId }, include: { games: true },
    });
    if (downstream && downstream.games.length > 0) {
      throw new TournamentStateError(
        'DOWNSTREAM_BLOCKED',
        `cannot edit: downstream match ${downstream.id} has recorded games — revoke it first`,
      );
    }
  }

  const score = computeSeriesScore(input.games, m.teamAId, m.teamBId);
  const finished = isSeriesComplete(m.format, score);
  const newStatus = input.games.length === 0
    ? 'SCHEDULED'
    : finished ? 'FINISHED' : 'IN_PROGRESS';
  const newWinner = finished
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;
  const previousWinner = m.winnerTeamId;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCH_EDITED',
    payload: { matchId: m.id, games: input.games },
    mutate: async (tx) => {
      await tx.matchGame.deleteMany({ where: { matchId: m.id } });
      for (let i = 0; i < input.games.length; i++) {
        await tx.matchGame.create({
          data: {
            matchId: m.id,
            gameNumber: i + 1,
            winnerTeamId: input.games[i].winnerTeamId,
          },
        });
      }
      await tx.match.update({
        where: { id: m.id },
        data: {
          status: newStatus,
          winnerTeamId: newWinner,
          walkoverNote: null,
        },
      });
      // Downstream advancement adjustment
      if (m.nextMatchId && m.nextSide) {
        if (newWinner) {
          await tx.match.update({
            where: { id: m.nextMatchId },
            data: m.nextSide === 'A' ? { teamAId: newWinner } : { teamBId: newWinner },
          });
        } else if (previousWinner) {
          await tx.match.update({
            where: { id: m.nextMatchId },
            data: m.nextSide === 'A' ? { teamAId: null } : { teamBId: null },
          });
        }
      }
    },
  });
}

async function advanceKnockoutIfApplicable(
  tx: Prisma.TransactionClient,
  m: Match,
  winnerTeamId: string,
): Promise<void> {
  if (!m.nextMatchId || !m.nextSide) return;
  await tx.match.update({
    where: { id: m.nextMatchId },
    data: m.nextSide === 'A' ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId },
  });
  // If this was the FINAL, write the champion on the tournament
  if (m.phase === 'FINAL') {
    await tx.tournament.update({
      where: { id: m.tournamentId },
      data: { status: 'FINISHED', championId: winnerTeamId, finishedAt: new Date() },
    });
  }
}
