import bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient, Player } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { PlayerInputType } from './schema';
import { dedupPositions } from './schema';

type Tx = PrismaClient | Prisma.TransactionClient;

const DEFAULT_PWD = process.env.DEFAULT_USER_PASSWORD ?? 'lol2026';

/**
 * Upsert a Player (and the linked User account) by gameId.
 * - If a User with this gameId exists, reuse it; otherwise create one with the default password.
 * - The User.role is CAPTAIN for all roster members; the seed creates the admin separately.
 * - mustChangePwd defaults to true so the captain is forced to rotate the shared default password on first login.
 */
export async function upsertPlayer(
  data: PlayerInputType,
  tx: Tx = prisma,
): Promise<{ player: Player; created: boolean }> {
  const clean = dedupPositions(data);

  const existing = await tx.player.findUnique({ where: { gameId: clean.gameId } });

  if (existing) {
    const player = await tx.player.update({
      where: { id: existing.id },
      data: {
        nickname: clean.nickname,
        primaryPositions: clean.primaryPositions,
        secondaryPositions: clean.secondaryPositions,
        cost: clean.cost,
        isCaptain: clean.isCaptain,
        isRetired: clean.isRetired,
      },
    });
    return { player, created: false };
  }

  // Create User first, then Player linked to it.
  const passwordHash = await bcrypt.hash(DEFAULT_PWD, 10);
  const user = await tx.user.create({
    data: {
      gameId: clean.gameId,
      passwordHash,
      role: 'CAPTAIN',
      mustChangePwd: true,
    },
  });

  const player = await tx.player.create({
    data: {
      gameId: clean.gameId,
      nickname: clean.nickname,
      primaryPositions: clean.primaryPositions,
      secondaryPositions: clean.secondaryPositions,
      cost: clean.cost,
      isCaptain: clean.isCaptain,
      isRetired: clean.isRetired,
      userId: user.id,
    },
  });

  return { player, created: true };
}

/**
 * Patch helper for the PATCH /api/players/:id endpoint.
 * gameId is the unique key — if changed, both Player.gameId and User.gameId must update together.
 */
export async function patchPlayer(
  playerId: string,
  patch: Partial<PlayerInputType>,
): Promise<Player> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.player.findUnique({ where: { id: playerId } });
    if (!current) throw new Error('PLAYER_NOT_FOUND');

    const data: Prisma.PlayerUpdateInput = {};
    if (patch.nickname !== undefined) data.nickname = patch.nickname;
    if (patch.primaryPositions !== undefined) data.primaryPositions = patch.primaryPositions;
    if (patch.secondaryPositions !== undefined) data.secondaryPositions = patch.secondaryPositions;
    if (patch.cost !== undefined) data.cost = patch.cost;
    if (patch.isCaptain !== undefined) data.isCaptain = patch.isCaptain;
    if (patch.isRetired !== undefined) data.isRetired = patch.isRetired;

    if (patch.gameId !== undefined && patch.gameId !== current.gameId) {
      data.gameId = patch.gameId;
      await tx.user.update({
        where: { id: current.userId },
        data: { gameId: patch.gameId },
      });
    }

    return tx.player.update({ where: { id: playerId } , data });
  });
}

/**
 * Delete a player and their linked User (cascade).
 */
export async function deletePlayer(playerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.player.findUnique({ where: { id: playerId } });
    if (!p) return;
    await tx.player.delete({ where: { id: playerId } });
    await tx.user.delete({ where: { id: p.userId } });
  });
}
