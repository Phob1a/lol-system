import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type AdminOverviewStats = {
  registrationCount: number;
  captainIntentionCount: number;
  draftStatus: string;
};

export async function getAdminOverviewStats(
  db: Db,
  seasonId: string,
): Promise<AdminOverviewStats> {
  const [registrationCount, captainIntentionCount, draftSession] = await Promise.all([
    db.registration.count({ where: { seasonId, status: 'ACTIVE' } }),
    db.registration.count({
      where: { seasonId, status: 'ACTIVE', willingToCaptain: true },
    }),
    db.draftSession.findUnique({ where: { seasonId } }),
  ]);

  return {
    registrationCount,
    captainIntentionCount,
    draftStatus: draftSession?.status ?? 'NOT_STARTED',
  };
}
