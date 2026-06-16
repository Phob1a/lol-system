import type { Match, Prisma, PrismaClient, StageType } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertTournamentWritable } from './guards';
import { claimMatch } from './score-service';
import { getActiveTournament } from './tournament-service';
import type { Db } from './types';

export type ReservationActor =
  | { role: 'ADMIN' }
  | { role: 'CAPTAIN'; teamId: string };

export type ReservableMatch = {
  id: string;
  version: number;
  label: string | null;
  roundKey: string | null;
  groupId: string | null;
  scheduledAt: string | null;
  status: Match['status'];
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  stage: { id: string; type: StageType; name: string };
};

export type CaptainReservationState = {
  tournamentId: string | null;
  scheduled: ReservableMatch[];
  candidates: ReservableMatch[];
};

const matchInclude = {
  teamA: { select: { id: true, name: true } },
  teamB: { select: { id: true, name: true } },
  stage: { select: { id: true, type: true, name: true } },
} satisfies Prisma.MatchInclude;

type MatchWithReservationRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

function shapeReservationMatch(match: MatchWithReservationRelations): ReservableMatch {
  return {
    id: match.id,
    version: match.version,
    label: match.label,
    roundKey: match.roundKey,
    groupId: match.groupId,
    scheduledAt: match.scheduledAt?.toISOString() ?? null,
    status: match.status,
    teamA: match.teamA,
    teamB: match.teamB,
    stage: match.stage,
  };
}

function captainMatchWhere(teamId: string) {
  return { OR: [{ teamAId: teamId }, { teamBId: teamId }] };
}

async function canListReservableMatches(db: Db, tournamentId: string): Promise<boolean> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, archivedAt: true } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status === 'ARCHIVED' || t.archivedAt !== null) return false;
  return t.status === 'GROUP_STAGE' || t.status === 'KNOCKOUT';
}

function assertCandidate(match: Match, actor: ReservationActor): void {
  if (match.status !== 'SCHEDULED')
    throw new TournamentError('INVALID_STATE', '只有待赛比赛可以预约');
  if (!match.teamAId || !match.teamBId)
    throw new TournamentError('INVALID_STATE', '比赛双方未确定');
  if (actor.role === 'CAPTAIN' && ![match.teamAId, match.teamBId].includes(actor.teamId)) {
    throw new TournamentError('FORBIDDEN', '无权操作该比赛');
  }
}

export async function listReservableMatches(
  db: Db,
  input: { tournamentId: string; actor: ReservationActor },
): Promise<ReservableMatch[]> {
  if (!(await canListReservableMatches(db, input.tournamentId))) return [];

  const matches = await db.match.findMany({
    where: {
      tournamentId: input.tournamentId,
      status: 'SCHEDULED',
      scheduledAt: null,
      teamAId: { not: null },
      teamBId: { not: null },
      ...(input.actor.role === 'CAPTAIN' ? captainMatchWhere(input.actor.teamId) : {}),
    },
    include: matchInclude,
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
  });

  return matches.map(shapeReservationMatch);
}

export async function reserveMatch(
  db: PrismaClient,
  input: {
    matchId: string;
    expectedVersion: number;
    scheduledAt: Date | null;
    actorUserId: string;
    actor: ReservationActor;
  },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertTournamentWritable(tx, match.tournamentId);

    const tournament = await tx.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { status: true },
    });
    if (!tournament) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
    if (!(tournament.status === 'GROUP_STAGE' || tournament.status === 'KNOCKOUT'))
      throw new TournamentError('INVALID_STATE', '当前赛事状态不允许预约');

    assertCandidate(match, input.actor);

    await tx.match.update({
      where: { id: match.id },
      data: { scheduledAt: input.scheduledAt },
    });

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'match.reschedule',
      entity: 'Match',
      entityId: match.id,
      payload: {
        scheduledAt: input.scheduledAt?.toISOString() ?? null,
        actorRole: input.actor.role,
        reservation: true,
      },
    });
  });
}

export async function listCaptainReservationState(
  db: PrismaClient,
  input: { teamId: string },
): Promise<CaptainReservationState> {
  const tournament = await getActiveTournament(db);
  if (!tournament) return { tournamentId: null, scheduled: [], candidates: [] };

  const scheduled = await db.match.findMany({
    where: {
      tournamentId: tournament.id,
      scheduledAt: { not: null },
      ...captainMatchWhere(input.teamId),
    },
    include: matchInclude,
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
  });
  const candidates = await listReservableMatches(db, {
    tournamentId: tournament.id,
    actor: { role: 'CAPTAIN', teamId: input.teamId },
  });

  return {
    tournamentId: tournament.id,
    scheduled: scheduled.map(shapeReservationMatch),
    candidates,
  };
}
