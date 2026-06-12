import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritable } from './guards';
import type { Db } from './types';

/** 原子性地认领版本：updateMany WHERE id=matchId AND version=expectedVersion，count=0 则冲突 */
export async function claimMatch(tx: Db, matchId: string, expectedVersion: number): Promise<Match> {
  const claimed = await tx.match.updateMany({
    where: { id: matchId, version: expectedVersion },
    data: { version: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const exists = await tx.match.findUnique({ where: { id: matchId } });
    if (!exists) throw new TournamentError('MATCH_NOT_FOUND', '比赛不存在');
    throw new TournamentError('VERSION_CONFLICT', 'VERSION_CONFLICT：比赛已被他人修改，请刷新');
  }
  return (await tx.match.findUnique({ where: { id: matchId } }))!;
}

export function winsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

/** 下游链上是否已有录入（Game 或非 SCHEDULED 状态）；有则拒绝 */
export async function assertDownstreamClean(db: Db, matchId: string): Promise<void> {
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
export async function resettleMatch(tx: Db, matchId: string): Promise<void> {
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
  await syncFinalStatus(tx, matchId, settledWinner !== null);
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

/** 该 match 是否为决赛：KNOCKOUT 阶段、roundKey 非空、无 outgoing WINNER 边。 */
async function isFinalMatch(tx: Db, matchId: string): Promise<boolean> {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    select: { roundKey: true, stage: { select: { type: true } } },
  });
  if (!m || m.roundKey === null || m.stage.type !== 'KNOCKOUT') return false;
  const out = await tx.matchAdvancementEdge.count({ where: { fromMatchId: matchId, outcome: 'WINNER' } });
  return out === 0;
}

/** 决赛结果变化后同步 tournament.status：有 winner → FINISHED；winner 回收 → 回退 KNOCKOUT。 */
async function syncFinalStatus(tx: Db, matchId: string, hasWinner: boolean): Promise<void> {
  if (!(await isFinalMatch(tx, matchId))) return;
  const m = (await tx.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } }))!;
  if (hasWinner) {
    await tx.tournament.update({ where: { id: m.tournamentId }, data: { status: 'FINISHED' } });
  } else {
    const t = await tx.tournament.findUnique({ where: { id: m.tournamentId }, select: { status: true } });
    if (t?.status === 'FINISHED')
      await tx.tournament.update({ where: { id: m.tournamentId }, data: { status: 'KNOCKOUT' } });
  }
}

export async function recordGame(
  db: PrismaClient,
  input: { matchId: string; expectedVersion: number; winnerTeamId: string; actorUserId: string },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);
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
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);
    await assertDownstreamClean(tx, match.id);
    const deleted = await tx.game.deleteMany({ where: { id: input.gameId, matchId: match.id } });
    if (deleted.count === 0)
      throw new TournamentError('VALIDATION', '该局不属于此比赛');
    await resettleMatch(tx, match.id);
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
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');
    if (![match.teamAId, match.teamBId].includes(input.winnerTeamId))
      throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
    if ((await tx.game.count({ where: { matchId: match.id } })) > 0)
      throw new TournamentError('INVALID_STATE', '已有局记录，不能轮空');
    await assertDownstreamClean(tx, match.id);
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'WALKOVER', winnerTeamId: input.winnerTeamId, isWalkover: true },
    });
    await propagate(tx, match.id, input.winnerTeamId);
    await syncFinalStatus(tx, match.id, true);
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
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);
    await assertDownstreamClean(tx, match.id);
    await tx.match.update({
      where: { id: match.id },
      data: { status: 'CANCELED', winnerTeamId: null },
    });
    await propagate(tx, match.id, null);
    await syncFinalStatus(tx, match.id, false);
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
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);
    await tx.match.update({
      where: { id: match.id },
      data: { scheduledAt: input.scheduledAt },
    });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.reschedule',
      entity: 'Match', entityId: match.id, payload: { scheduledAt: input.scheduledAt?.toISOString() ?? null },
    });
  });
}

const MAX_BATCH = 200;

/**
 * 批量改期（spec §2.1）：全部校验与写入在同一事务内，all-or-nothing。
 * reschedule 不触碰结算，version 仅作并发标记（与单场 rescheduleMatch 一致）。
 */
export async function rescheduleMatches(
  db: PrismaClient,
  input: {
    items: Array<{ matchId: string; expectedVersion: number; scheduledAt: Date | null }>;
    actorUserId: string;
  },
): Promise<void> {
  const { items } = input;
  return db.$transaction(async (tx) => {
    // (a) items 非空 / ≤200 / matchId 唯一
    if (items.length === 0) throw new TournamentError('VALIDATION', '改期列表不能为空');
    if (items.length > MAX_BATCH) throw new TournamentError('VALIDATION', `单次改期不能超过 ${MAX_BATCH} 项`);
    const ids = items.map((i) => i.matchId);
    if (new Set(ids).size !== ids.length) throw new TournamentError('VALIDATION', '比赛重复');

    // (b) 一次性 load 全部 match（缺任一 → MATCH_NOT_FOUND）
    const found = await tx.match.findMany({
      where: { id: { in: ids } },
      select: { id: true, tournamentId: true },
    });
    if (found.length !== ids.length) throw new TournamentError('MATCH_NOT_FOUND', '部分比赛不存在');

    // (c) 全部同属一个 tournament
    const tournamentIds = new Set(found.map((m) => m.tournamentId));
    if (tournamentIds.size !== 1) throw new TournamentError('VALIDATION', '批量改期必须属于同一赛事');
    const tournamentId = found[0].tournamentId;

    // 赛季可写校验——复用现有守卫双条件语义（status==='ARCHIVED' || archivedAt!==null）；
    // 归档 → 抛 INVALID_STATE。绝不内联只判 archivedAt 的简化版。
    // （等价内联，若为省 DB 往返：
    //    const t = await tx.tournament.findUnique({
    //      where: { id: tournamentId },
    //      select: { season: { select: { status: true, archivedAt: true } } },
    //    });
    //    if (t!.season.status === 'ARCHIVED' || t!.season.archivedAt !== null)
    //      throw new TournamentError('INVALID_STATE', '赛季已归档，赛事只读');
    //  —— 必须保留 status||archivedAt 双条件，与 assertSeasonWritableBySeasonId 一致。）
    await assertSeasonWritable(tx, tournamentId);

    // (d) 逐项乐观锁 CAS（count=0 → VERSION_CONFLICT，整体回滚）
    for (const it of items) {
      const res = await tx.match.updateMany({
        where: { id: it.matchId, version: it.expectedVersion },
        data: { scheduledAt: it.scheduledAt, version: { increment: 1 } },
      });
      if (res.count === 0)
        throw new TournamentError('VERSION_CONFLICT', 'VERSION_CONFLICT：部分比赛已被修改，请刷新');
    }

    // (e) 审计一条
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'match.schedule.batch',
      entity: 'Tournament',
      entityId: tournamentId,
      payload: { count: items.length },
    });
  });
}
