import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { Db } from './types';

/** 取 Match 并校验版本 */
async function lockMatch(db: Db, matchId: string, expectedVersion: number): Promise<Match> {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) throw new TournamentError('MATCH_NOT_FOUND', '比赛不存在');
  if (match.version !== expectedVersion)
    throw new TournamentError('VERSION_CONFLICT', 'VERSION_CONFLICT：比赛已被他人修改，请刷新');
  return match;
}

function winsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

/** 下游链上是否已有录入（Game 或非 SCHEDULED 状态）；有则拒绝 */
async function assertDownstreamClean(db: Db, matchId: string): Promise<void> {
  const edges = await db.matchAdvancementEdge.findMany({ where: { fromMatchId: matchId } });
  for (const e of edges) {
    const to = await db.match.findUnique({
      where: { id: e.toMatchId },
      include: { _count: { select: { games: true } } },
    });
    if (!to) continue;
    if (to._count.games > 0 || to.status !== 'SCHEDULED')
      throw new TournamentError('DOWNSTREAM_RECORDED', 'DOWNSTREAM_RECORDED：下游比赛已有记录，请先删除下游数据');
    await assertDownstreamClean(db, to.id);
  }
}

/** 重算 Match 物化结果并沿 WINNER 边推进/回收（调用方保证在事务内） */
async function resettleMatch(tx: Db, matchId: string): Promise<void> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { games: { where: { isDraft: false } } },
  });
  if (!match) return;

  const need = winsNeeded(match.bestOf);
  const winsByTeam = new Map<string, number>();
  for (const g of match.games) {
    if (g.winnerTeamId) winsByTeam.set(g.winnerTeamId, (winsByTeam.get(g.winnerTeamId) ?? 0) + 1);
  }
  const settledWinner = [...winsByTeam.entries()].find(([, w]) => w >= need)?.[0] ?? null;

  await tx.match.update({
    where: { id: matchId },
    data: {
      status: settledWinner ? 'FINISHED' : 'SCHEDULED',
      winnerTeamId: settledWinner,
      isWalkover: false,
    },
  });
  await propagate(tx, matchId, settledWinner);
}

/** 把（新的）胜者写到 WINNER 边目标位；胜者为 null 时回收 */
async function propagate(tx: Db, matchId: string, winnerTeamId: string | null): Promise<void> {
  const edges = await tx.matchAdvancementEdge.findMany({
    where: { fromMatchId: matchId, outcome: 'WINNER' },
  });
  for (const e of edges) {
    await tx.match.update({
      where: { id: e.toMatchId },
      data: e.slot === 'A' ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId },
    });
  }
}

export async function recordGame(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; winnerTeamId: string; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    if (match.status === 'CANCELED' || match.status === 'WALKOVER')
      throw new TournamentError('INVALID_STATE', '该比赛状态不允许录入');
    if (!match.teamAId && !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');
    if (![match.teamAId, match.teamBId].includes(input.winnerTeamId))
      throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
    if (match.status === 'FINISHED') await assertDownstreamClean(tx, match.id); // 加局 = 改判

    const count = await tx.game.count({ where: { matchId: match.id } });
    if (count >= match.bestOf) throw new TournamentError('VALIDATION', '局数已达上限');

    await tx.game.create({
      data: { matchId: match.id, index: count + 1, isDraft: false, winnerTeamId: input.winnerTeamId },
    });
    await resettleMatch(tx, match.id);
    await tx.match.update({ where: { id: match.id }, data: { version: { increment: 1 } } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.record',
      entity: 'Match', entityId: match.id,
      payload: { gameIndex: count + 1, winnerTeamId: input.winnerTeamId },
    });
  });
}

export async function deleteGame(
  db: PrismaClient,
  input: { matchId: string; gameId: string; expectedVersion: number; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await assertDownstreamClean(tx, match.id);
    await tx.game.delete({ where: { id: input.gameId } });
    await resettleMatch(tx, match.id);
    await tx.match.update({ where: { id: match.id }, data: { version: { increment: 1 } } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.delete',
      entity: 'Match', entityId: match.id, payload: { gameId: input.gameId },
    });
  });
}

export async function setWalkover(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; winnerTeamId: string; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');
    if (![match.teamAId, match.teamBId].includes(input.winnerTeamId))
      throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
    if ((await tx.game.count({ where: { matchId: match.id } })) > 0)
      throw new TournamentError('INVALID_STATE', '已有局记录，不能轮空');
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'WALKOVER', winnerTeamId: input.winnerTeamId, isWalkover: true, version: { increment: 1 } },
    });
    await propagate(tx, match.id, input.winnerTeamId);
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.walkover',
      entity: 'Match', entityId: match.id, payload: { winnerTeamId: input.winnerTeamId },
    });
  });
}

export async function cancelMatch(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await assertDownstreamClean(tx, match.id);
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'CANCELED', winnerTeamId: null, version: { increment: 1 } },
    });
    await propagate(tx, match.id, null);
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.cancel', entity: 'Match', entityId: match.id,
    });
  });
}

export async function rescheduleMatch(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; scheduledAt: Date | null; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId, input.expectedVersion);
    await tx.match.update({
      where: { id: match.id },
      data: { scheduledAt: input.scheduledAt, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.reschedule',
      entity: 'Match', entityId: match.id, payload: { scheduledAt: input.scheduledAt?.toISOString() ?? null },
    });
  });
}
