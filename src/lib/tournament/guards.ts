import { TournamentError } from './errors';
import type { Db } from './types';

/** 赛事已归档（status ARCHIVED 或 archivedAt 非空）则抛错。供所有按 tournamentId 的写服务使用。 */
export async function assertTournamentWritable(db: Db, tournamentId: string): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, archivedAt: true } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status === 'ARCHIVED' || t.archivedAt !== null)
    throw new TournamentError('INVALID_STATE', '赛事已归档，不可修改');
}
