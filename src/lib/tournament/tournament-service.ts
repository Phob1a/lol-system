import type { PrismaClient, Tournament, Group } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export { TournamentStateError };

export interface CreateTournamentInput {
  name: string;
  groupCount: number;
  teamsPerGroup: number;
  advancingPerGroup: number;
  actorId: string;
}

export type TournamentWithGroups = Tournament & { groups: Group[] };

const ACTIVE_STATUSES = ['NOT_STARTED', 'GROUP_STAGE', 'BRACKET_SEEDING', 'KNOCKOUT'] as const;

export async function getActiveTournament(db: PrismaClient): Promise<TournamentWithGroups | null> {
  return db.tournament.findFirst({
    where: { status: { in: [...ACTIVE_STATUSES] } },
    include: { groups: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTournament(
  db: PrismaClient,
  input: CreateTournamentInput,
): Promise<TournamentWithGroups> {
  if (input.advancingPerGroup * input.groupCount !== 8) {
    throw new TournamentStateError(
      'INVALID_CONFIG',
      'advancingPerGroup × groupCount must equal 8',
    );
  }
  if (input.groupCount < 1 || input.teamsPerGroup < 2) {
    throw new TournamentStateError('INVALID_CONFIG', 'invalid group configuration');
  }

  const draft = await db.draftSession.findFirst({ where: { status: 'FINISHED' } });
  if (!draft) {
    throw new TournamentStateError('DRAFT_NOT_FINISHED', 'cannot create tournament before draft finishes');
  }

  const active = await getActiveTournament(db);
  if (active) {
    throw new TournamentStateError('ACTIVE_EXISTS', 'another tournament is currently active');
  }

  const tournament = await db.tournament.create({
    data: {
      name: input.name,
      status: 'NOT_STARTED',
      groupCount: input.groupCount,
      teamsPerGroup: input.teamsPerGroup,
      advancingPerGroup: input.advancingPerGroup,
      startedAt: new Date(),
    },
  });
  await appendEvent(db, {
    tournamentId: tournament.id,
    expectedSeq: 0,
    actorId: input.actorId,
    type: 'TOURNAMENT_CREATED',
    payload: {
      name: input.name,
      groupCount: input.groupCount,
      teamsPerGroup: input.teamsPerGroup,
      advancingPerGroup: input.advancingPerGroup,
    },
    mutate: async (tx) => {
      const letters = Array.from({ length: input.groupCount }, (_, i) =>
        String.fromCharCode(65 + i),
      );
      await tx.group.createMany({
        data: letters.map(letter => ({ tournamentId: tournament.id, letter })),
      });
    },
  });

  return (await db.tournament.findUnique({
    where: { id: tournament.id }, include: { groups: true },
  }))!;
}

export async function resetTournament(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');

  // Archive: rename + set to FINISHED, and bump seq via appendEvent
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TOURNAMENT_RESET',
    payload: { previousStatus: t.status, previousName: t.name },
    mutate: async (tx) => {
      await tx.tournament.update({
        where: { id: t.id },
        data: { name: `[archived] ${t.name}`, status: 'FINISHED', finishedAt: new Date() },
      });
    },
  });
  return (await db.tournament.findUnique({ where: { id: t.id } }))!;
}
