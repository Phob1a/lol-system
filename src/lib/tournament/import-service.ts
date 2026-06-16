import { summarySchema } from './import-schema';
import type { Db } from './types';

export async function ingestImport(db: Db, raw: unknown, source: 'SCRIPT' | 'UPLOAD') {
  const s = summarySchema.parse(raw);
  const dup = await db.matchImport.findFirst({
    where: { externalGameId: s.gameId, status: 'COMMITTED' },
    select: { id: true },
  });
  const row = await db.matchImport.create({
    data: {
      source,
      status: 'PENDING',
      externalGameId: s.gameId,
      gameVersion: s.gameVersion ?? null,
      gameMode: s.gameMode ?? null,
      gameType: s.gameType ?? null,
      queueId: s.queueId ?? null,
      mapId: s.mapId ?? null,
      gameCreation: s.gameCreation ?? null,
      durationSeconds: s.gameDuration ?? null,
      rawJson: raw as object,
    },
  });
  return {
    importId: row.id,
    externalGameId: row.externalGameId.toString(),
    duplicateOfCommitted: !!dup,
  };
}
