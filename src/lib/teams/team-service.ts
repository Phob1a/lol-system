import bcrypt from 'bcryptjs';
import { Prisma, type PrismaClient } from '@prisma/client';
import { generatePassword } from '@/lib/captains/credentials';
import { CaptainError } from '@/lib/captains/errors';

export type TeamWithRefs = Prisma.TeamGetPayload<{
  include: {
    captain: { select: { id: true; nickname: true } };
    account: { select: { username: true } };
  };
}>;

export async function listTournamentTeams(
  db: PrismaClient,
  tournamentId: string,
): Promise<TeamWithRefs[]> {
  return db.team.findMany({
    where: { tournamentId },
    include: {
      captain: { select: { id: true, nickname: true } },
      account: { select: { username: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Regenerate a team account's password. Returns plaintext for one-time display. */
export async function resetTeamPassword(
  db: PrismaClient,
  teamId: string,
): Promise<{ password: string }> {
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) throw new CaptainError('NOT_FOUND', '队伍不存在');
  const password = generatePassword();
  await db.user.update({
    where: { id: team.userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  return { password };
}

/** Rename a team. Authorization is enforced by the route. */
export async function renameTeam(
  db: PrismaClient,
  teamId: string,
  name: string,
): Promise<void> {
  await db.team.update({ where: { id: teamId }, data: { name } });
}

/** Update a team's captain-editable profile (name + slogan). Authorization is enforced by the route. */
export async function updateTeamProfile(
  db: PrismaClient,
  teamId: string,
  input: { name: string; slogan: string | null },
): Promise<void> {
  await db.team.update({
    where: { id: teamId },
    data: { name: input.name, slogan: input.slogan },
  });
}
