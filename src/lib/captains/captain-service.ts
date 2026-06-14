import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { generatePassword, generateUsername } from './credentials';
import { CaptainError } from './errors';

export interface AppointResult {
  teamId: string;
  username: string;
  password: string; // plaintext — returned once, never persisted
}

/** Generate a username not already taken. */
async function uniqueUsername(db: PrismaClient): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateUsername();
    if (!(await db.user.findUnique({ where: { username: candidate } }))) return candidate;
  }
  throw new CaptainError('NOT_FOUND', '无法生成唯一队伍账号，请重试');
}

/**
 * Appoint a registration as captain: flips isCaptain, creates the Team and a
 * fresh team account. Allowed only while the season is ROSTER_LOCKED.
 * Returns plaintext credentials for one-time display.
 */
export async function appointCaptain(
  db: PrismaClient,
  registrationId: string,
): Promise<AppointResult> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });
  if (!reg) throw new CaptainError('NOT_FOUND', '报名记录不存在');
  if (reg.tournament.status !== 'ROSTER_LOCKED') {
    throw new CaptainError('WRONG_SEASON_STATE', '仅在名册锁定阶段可任命队长');
  }
  if (reg.isCaptain) throw new CaptainError('ALREADY_CAPTAIN', '该选手已是队长');

  const username = await uniqueUsername(db);
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const team = await db.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { isCaptain: true },
    });
    const account = await tx.user.create({
      data: { username, passwordHash, role: 'CAPTAIN', mustChangePwd: false },
    });
    return tx.team.create({
      data: {
        tournamentId: reg.tournamentId,
        name: `${reg.nickname} 队`,
        captainId: registrationId,
        userId: account.id,
      },
    });
  });

  return { teamId: team.id, username, password };
}

/**
 * Revoke a captain before the draft starts: deletes the Team (cascading slots)
 * and the team account, resets isCaptain. Rejected once a draft session exists.
 */
export async function revokeCaptain(
  db: PrismaClient,
  registrationId: string,
): Promise<void> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: { include: { draftSession: true } }, teamAsCaptain: true },
  });
  if (!reg) throw new CaptainError('NOT_FOUND', '报名记录不存在');
  if (!reg.isCaptain || !reg.teamAsCaptain) {
    throw new CaptainError('NOT_A_CAPTAIN', '该选手不是队长');
  }
  if (reg.tournament.draftSession) {
    throw new CaptainError('DRAFT_ALREADY_STARTED', '选秀已开始，无法撤销队长');
  }

  const userId = reg.teamAsCaptain.userId;
  await db.$transaction(async (tx) => {
    await tx.team.delete({ where: { id: reg.teamAsCaptain!.id } });
    await tx.user.delete({ where: { id: userId } });
    await tx.registration.update({
      where: { id: registrationId },
      data: { isCaptain: false },
    });
  });
}
