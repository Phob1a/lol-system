import { Prisma, type PrismaClient, type Registration } from '@prisma/client';
import { getActiveSeason } from '@/lib/season/season-service';
import type { PublicRegistrationInput } from './registration-schema';
import { RegistrationError } from './errors';

/**
 * Public, anonymous registration. Find-or-create the Player master by gameId,
 * then create the per-season Registration. The unique [seasonId, playerId]
 * constraint makes duplicate submissions fail.
 */
export async function submitPublicRegistration(
  db: PrismaClient,
  input: PublicRegistrationInput,
): Promise<Registration> {
  const season = await getActiveSeason(db);
  if (!season || season.status !== 'REGISTRATION') {
    throw new RegistrationError('REGISTRATION_CLOSED', '当前没有开放报名的赛季');
  }

  return db.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { gameId: input.gameId },
      create: { gameId: input.gameId, nickname: input.nickname },
      update: { nickname: input.nickname },
    });

    try {
      return await tx.registration.create({
        data: {
          seasonId: season.id,
          playerId: player.id,
          nickname: input.nickname,
          primaryPositions: input.primaryPositions,
          secondaryPositions: input.secondaryPositions,
          currentRank: input.currentRank,
          peakRank: input.peakRank,
          willingToCaptain: input.willingToCaptain,
          statement: input.statement ?? null,
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
