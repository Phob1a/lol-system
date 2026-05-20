import type { Prisma, PrismaClient, Season } from '@prisma/client';
import type { CreateSeasonInput } from './season-schema';

type Db = PrismaClient | Prisma.TransactionClient;

/** The single non-archived season, or null. */
export async function getActiveSeason(db: Db): Promise<Season | null> {
  return db.season.findFirst({ where: { status: { not: 'ARCHIVED' } } });
}

export async function listSeasons(db: Db): Promise<Season[]> {
  return db.season.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Archive the current active season (no-op if none). */
export async function archiveActiveSeason(db: Db): Promise<void> {
  const active = await getActiveSeason(db);
  if (!active) return;
  await db.season.update({
    where: { id: active.id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

/**
 * Create a season in SETUP. If an active season exists it is archived first,
 * so at most one season is ever non-archived.
 */
export async function createSeason(
  db: PrismaClient,
  input: CreateSeasonInput,
): Promise<Season> {
  return db.$transaction(async (tx) => {
    await archiveActiveSeason(tx);
    return tx.season.create({
      data: { name: input.name, teamBudget: input.teamBudget, status: 'SETUP' },
    });
  });
}
