import { TournamentError } from './errors';
import type { Db } from './types';

/** 赛季归档（status ARCHIVED 或 archivedAt 非空）则抛错。供 createTournamentShell 等无 tournamentId 入口使用。 */
export async function assertSeasonWritableBySeasonId(db: Db, seasonId: string): Promise<void> {
  const season = await db.season.findUnique({
    where: { id: seasonId },
    select: { status: true, archivedAt: true },
  });
  if (!season) throw new TournamentError('SEASON_NOT_FOUND', '赛季不存在');
  if (season.status === 'ARCHIVED' || season.archivedAt !== null)
    throw new TournamentError('INVALID_STATE', '赛季已归档，赛事只读');
}

/** 经 tournament 取 seasonId 后委托 assertSeasonWritableBySeasonId。供所有按 tournamentId 的写服务使用。 */
export async function assertSeasonWritable(db: Db, tournamentId: string): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { seasonId: true },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);
}
