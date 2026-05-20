import type { Prisma, PrismaClient, Season, SeasonStatus } from '@prisma/client';
import type { CreateSeasonInput } from './season-schema';
import { SeasonError } from './errors';

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

// Allowed status edges. ARCHIVED is reached only via createSeason / archiveActiveSeason.
const ALLOWED: Record<SeasonStatus, SeasonStatus[]> = {
  SETUP: ['REGISTRATION'],
  REGISTRATION: ['ROSTER_LOCKED'],
  ROSTER_LOCKED: ['REGISTRATION', 'DRAFTING'],
  DRAFTING: ['COMPLETED'],
  COMPLETED: [],
  ARCHIVED: [],
};

/**
 * Move a season to `next`. Validates the edge only — caller-specific
 * preconditions (e.g. captains exist before DRAFTING) are enforced by the
 * relevant service (captain-service / draft engine).
 */
export async function transitionSeason(
  db: Db,
  seasonId: string,
  next: SeasonStatus,
): Promise<Season> {
  const season = await db.season.findUnique({ where: { id: seasonId } });
  if (!season) throw new SeasonError('PRECONDITION_FAILED', '赛季不存在');
  if (!ALLOWED[season.status].includes(next)) {
    throw new SeasonError(
      'INVALID_TRANSITION',
      `不允许的赛季状态变更: ${season.status} → ${next}`,
    );
  }
  return db.season.update({ where: { id: seasonId }, data: { status: next } });
}
