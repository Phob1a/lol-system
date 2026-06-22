import { Prisma, type PrismaClient, type Registration, type TournamentStatus } from '@prisma/client';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import type { PublicRegistrationInput, AdminRegistrationCreate, AdminRegistrationPatch } from './registration-schema';
import { RegistrationError } from './errors';

// Roster mutations (add/edit/delete) are allowed only before the draft starts.
// Once DRAFTING begins, DraftPick.costPaid and TeamSlot snapshots have frozen
// the names/costs admins might change, so silent edits would create drift.
export const ROSTER_EDITABLE_STATUSES: TournamentStatus[] = ['SETUP', 'REGISTRATION', 'ROSTER_LOCKED'];

export function isRosterEditable(status: TournamentStatus): boolean {
  return ROSTER_EDITABLE_STATUSES.includes(status);
}

function assertRosterEditable(status: TournamentStatus): void {
  if (!isRosterEditable(status)) {
    throw new RegistrationError('TOURNAMENT_LOCKED', '选秀启动后名册已锁定，不可改动报名');
  }
}

function displayNickname(input: { gameId: string; nickname?: string | null }): string {
  const nickname = input.nickname?.trim();
  return nickname && nickname.length > 0 ? nickname : input.gameId;
}

/**
 * Public, anonymous registration. Find-or-create the Player master by gameId,
 * then create the per-season Registration. The unique [seasonId, playerId]
 * constraint makes duplicate submissions fail.
 */
export async function submitPublicRegistration(
  db: PrismaClient,
  input: PublicRegistrationInput,
): Promise<Registration> {
  const tournament = await getActiveTournament(db);
  if (!tournament || tournament.status !== 'REGISTRATION') {
    throw new RegistrationError('REGISTRATION_CLOSED', '当前没有开放报名的赛季');
  }

  return db.$transaction(async (tx) => {
    const nickname = displayNickname(input);
    const player = await tx.player.upsert({
      where: { gameId: input.gameId },
      create: { gameId: input.gameId, nickname },
      update: { nickname },
    });

    try {
      return await tx.registration.create({
        data: {
          tournamentId: tournament.id,
          playerId: player.id,
          nickname,
          primaryPositions: input.primaryPositions,
          secondaryPositions: input.secondaryPositions,
          currentRank: input.currentRank,
          peakRank: input.peakRank,
          willingToCaptain: input.willingToCaptain,
          statement: input.statement ?? null,
          availability: input.availability,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new RegistrationError('DUPLICATE_GAME_ID', '该游戏 ID 本赛季已报名');
      }
      throw e;
    }
  });
}

export type RegistrationWithPlayer = Prisma.RegistrationGetPayload<{
  include: { player: { select: { gameId: true } } };
}>;

export async function listTournamentRegistrations(
  db: PrismaClient,
  tournamentId: string,
): Promise<RegistrationWithPlayer[]> {
  return db.registration.findMany({
    where: { tournamentId },
    include: { player: { select: { gameId: true } } },
    orderBy: { registeredAt: 'asc' },
  });
}

export async function patchRegistration(
  db: PrismaClient,
  registrationId: string,
  patch: AdminRegistrationPatch,
): Promise<Registration> {
  const existing = await db.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: { select: { status: true } } },
  });
  if (!existing) throw new RegistrationError('NOT_FOUND', '报名记录不存在');
  assertRosterEditable(existing.tournament.status);
  return db.registration.update({ where: { id: registrationId }, data: patch });
}

export async function deleteRegistration(
  db: PrismaClient,
  registrationId: string,
): Promise<void> {
  const existing = await db.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: { select: { status: true } } },
  });
  if (!existing) throw new RegistrationError('NOT_FOUND', '报名记录不存在');
  assertRosterEditable(existing.tournament.status);
  await db.registration.delete({ where: { id: registrationId } });
}

export async function adminCreateRegistration(
  db: PrismaClient,
  tournamentId: string,
  input: AdminRegistrationCreate,
): Promise<Registration> {
  return db.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true },
    });
    if (!tournament) throw new RegistrationError('NOT_FOUND', '赛事不存在');
    assertRosterEditable(tournament.status);
    const nickname = displayNickname(input);
    const player = await tx.player.upsert({
      where: { gameId: input.gameId },
      create: { gameId: input.gameId, nickname },
      update: { nickname },
    });
    try {
      return await tx.registration.create({
        data: {
          tournamentId,
          playerId: player.id,
          nickname,
          primaryPositions: input.primaryPositions,
          secondaryPositions: input.secondaryPositions,
          currentRank: input.currentRank,
          peakRank: input.peakRank,
          willingToCaptain: input.willingToCaptain,
          statement: input.statement ?? null,
          availability: input.availability ?? '',
          cost: input.cost,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new RegistrationError('DUPLICATE_GAME_ID', '该游戏 ID 本赛季已报名');
      }
      throw e;
    }
  });
}
