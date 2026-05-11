import type { PrismaClient, Tournament, Group } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';
import { computeStandings } from './standings-service';

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

export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'GROUP_STAGE') {
    throw new TournamentStateError('WRONG_STATUS', 'must be GROUP_STAGE');
  }
  const matches = await db.match.findMany({
    where: { tournamentId: t.id, phase: { in: ['GROUP', 'TIEBREAKER'] } },
  });
  const unfinished = matches.filter(
    m => m.status !== 'FINISHED' && m.status !== 'WALKOVER' && m.status !== 'CANCELLED',
  );
  if (unfinished.length > 0) {
    throw new TournamentStateError(
      'UNFINISHED_MATCHES',
      `${unfinished.length} group match(es) still unfinished`,
    );
  }
  const standings = computeStandings(matches.map(m => ({
    id: m.id, phase: m.phase, groupId: m.groupId, status: m.status,
    teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
  })));
  if (standings.tieGroups.length > 0) {
    const err = new TournamentStateError(
      'UNRESOLVED_TIES',
      `unresolved ties: ${JSON.stringify(standings.tieGroups)}`,
    );
    (err as TournamentStateError & { tieGroups?: unknown }).tieGroups = standings.tieGroups;
    throw err;
  }
  // Compute advancing list by taking top advancingPerGroup of each group
  const advancing: string[] = [];
  for (const g of Object.keys(standings.byGroup)) {
    advancing.push(...standings.byGroup[g].slice(0, t.advancingPerGroup).map(r => r.teamId));
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'GROUP_STAGE_CLOSED',
    payload: { advancing },
    mutate: async (tx) => {
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'BRACKET_SEEDING' } });
    },
  });
}

export async function createTiebreaker(
  db: PrismaClient,
  input: { tournamentId: string; teamAId: string; teamBId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'GROUP_STAGE') {
    throw new TournamentStateError('WRONG_STATUS', 'tiebreaker only in GROUP_STAGE');
  }
  const aGroup = await db.groupTeam.findUnique({
    where: { teamId: input.teamAId }, include: { group: true },
  });
  const bGroup = await db.groupTeam.findUnique({
    where: { teamId: input.teamBId }, include: { group: true },
  });
  if (!aGroup || !bGroup) {
    throw new TournamentStateError('TEAM_NOT_FOUND', 'one or both teams not in any group');
  }
  if (aGroup.group.tournamentId !== t.id || bGroup.group.tournamentId !== t.id) {
    throw new TournamentStateError('WRONG_TOURNAMENT', 'teams not in this tournament');
  }
  if (aGroup.groupId !== bGroup.groupId) {
    throw new TournamentStateError('DIFFERENT_GROUPS', 'tiebreaker must be within one group');
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TIEBREAKER_CREATED',
    payload: { teamAId: input.teamAId, teamBId: input.teamBId, groupId: aGroup.groupId },
    mutate: async (tx) => {
      await tx.match.create({
        data: {
          tournamentId: t.id,
          phase: 'TIEBREAKER',
          format: 'BO1',
          status: 'SCHEDULED',
          groupId: aGroup.groupId,
          teamAId: input.teamAId,
          teamBId: input.teamBId,
        },
      });
    },
  });
}
