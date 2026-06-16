import type { Prisma } from '@prisma/client';
import type { Db } from './types';

export async function writeAudit(
  db: Db,
  entry: {
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    payload?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLog.create({ data: entry });
}
