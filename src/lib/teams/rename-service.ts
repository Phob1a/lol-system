import type { PrismaClient } from '@prisma/client';

export class TeamRenameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const NAME_MIN = 2;
const NAME_MAX = 30;

export async function renameTeam(
  db: PrismaClient,
  input: { teamId: string; newName: string },
): Promise<void> {
  const name = input.newName.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new TeamRenameError('INVALID_LENGTH', `name must be ${NAME_MIN}–${NAME_MAX} chars`);
  }
  // Reject control characters (0x00-0x1F, 0x7F)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(name)) {
    throw new TeamRenameError('INVALID_CHARS', 'name contains control characters');
  }
  const existing = await db.team.findUnique({ where: { id: input.teamId } });
  if (!existing) throw new TeamRenameError('NOT_FOUND', 'team not found');
  if (existing.name === name) return; // no-op
  try {
    await db.team.update({ where: { id: input.teamId }, data: { name } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new TeamRenameError('DUPLICATE', `name "${name}" is already taken`);
    }
    throw e;
  }
}
