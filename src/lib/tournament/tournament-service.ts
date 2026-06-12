import type { PrismaClient, Tournament } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { Db, GroupKnockoutConfig } from './types';

export async function getTournamentBySeason(db: Db, seasonId: string): Promise<Tournament | null> {
  return db.tournament.findUnique({ where: { seasonId } });
}

/** 落库赛事骨架：阶段 + 组占位 + 淘汰赛空位对阵 + 晋级边（小组赛对阵在 confirmGroups 生成）。调用方保证在事务内。 */
export async function createSkeletonRecords(
  tx: Db,
  tournamentId: string,
  config: GroupKnockoutConfig,
): Promise<void> {
  const skeleton = groupKnockout.generate(config.groupCount * config.teamsPerGroup, config);
  const matchIdByKey = new Map<string, string>();
  for (const stage of skeleton.stages) {
    const st = await tx.tournamentStage.create({
      data: { tournamentId, type: stage.type, name: stage.name, order: stage.order, bestOf: stage.bestOf },
    });
    for (const g of stage.groups) {
      await tx.tournamentGroup.create({ data: { stageId: st.id, name: g.name } });
    }
    if (stage.type !== 'KNOCKOUT') continue;
    for (const m of stage.matches) {
      const created = await tx.match.create({
        data: { tournamentId, stageId: st.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf },
      });
      matchIdByKey.set(m.key, created.id);
    }
  }
  for (const e of skeleton.edges) {
    await tx.matchAdvancementEdge.create({
      data: {
        fromMatchId: matchIdByKey.get(e.fromKey)!,
        toMatchId: matchIdByKey.get(e.toKey)!,
        outcome: e.outcome,
        slot: e.slot,
      },
    });
  }
}

/**
 * 建 Tournament(SETUP) + 骨架（不建参赛队快照——快照在 assignGroups 重建）。
 * spec §3.1 契约：第一参数 Db，**自身不开 $transaction**，由调用方保证原子性。
 */
export async function createTournamentShell(
  db: Db,
  input: { seasonId: string; name: string; kind: string; config: GroupKnockoutConfig; actorUserId: string },
): Promise<Tournament> {
  const config = groupKnockout.validate(input.config);
  await assertSeasonWritableBySeasonId(db, input.seasonId); // 不存在 → SEASON_NOT_FOUND；归档 → INVALID_STATE
  if (await db.tournament.findUnique({ where: { seasonId: input.seasonId } }))
    throw new TournamentError('TOURNAMENT_EXISTS', '该赛季已存在赛事');

  const t = await db.tournament.create({
    data: { seasonId: input.seasonId, name: input.name, kind: input.kind, status: 'SETUP', config },
  });
  await createSkeletonRecords(db, t.id, config);
  await writeAudit(db, {
    userId: input.actorUserId,
    action: 'tournament.create',
    entity: 'Tournament',
    entityId: t.id,
    payload: { name: input.name, config: config as object },
  });
  return t;
}

/** 清空赛事结构：阶段（级联组/组队/比赛→局/edges）+ 参赛队快照。调用方保证在事务内。 */
export async function clearTournamentStructure(tx: Db, tournamentId: string): Promise<void> {
  await tx.tournamentStage.deleteMany({ where: { tournamentId } }); // 级联 groups/groupTeams/matches/games/edges
  await tx.tournamentTeam.deleteMany({ where: { tournamentId } });
}

/**
 * 修改赛事配置。
 * - name/kind：status ≠ FINISHED 可改。
 * - config：仅 status = SETUP；清空结构后按新 config 重建骨架（快照同被清空）。
 */
export async function updateTournamentConfig(
  db: PrismaClient,
  input: { tournamentId: string; name?: string; kind?: string; config?: GroupKnockoutConfig; actorUserId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  const wantsName = input.name !== undefined;
  const wantsKind = input.kind !== undefined;
  const wantsConfig = input.config !== undefined;

  if ((wantsName || wantsKind) && t.status === 'FINISHED')
    throw new TournamentError('INVALID_STATE', '赛事已结束，不能修改');
  if (wantsConfig && t.status !== 'SETUP')
    throw new TournamentError('INVALID_STATE', '仅 SETUP 状态可修改赛制配置');

  const validated = wantsConfig ? groupKnockout.validate(input.config!) : null;

  return db.$transaction(async (tx) => {
    if (validated) {
      await clearTournamentStructure(tx, input.tournamentId);
      await createSkeletonRecords(tx, input.tournamentId, validated);
    }
    const updated = await tx.tournament.update({
      where: { id: input.tournamentId },
      data: {
        ...(wantsName ? { name: input.name } : {}),
        ...(wantsKind ? { kind: input.kind } : {}),
        ...(validated ? { config: validated } : {}),
      },
    });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.config.update',
      entity: 'Tournament',
      entityId: input.tournamentId,
      payload: {
        ...(wantsName ? { name: input.name } : {}),
        ...(wantsKind ? { kind: input.kind } : {}),
        ...(validated ? { config: validated as object } : {}),
      },
    });
    return updated;
  });
}

/** 重置赛事：清空结构 + 比分 → 按当前 config 重建骨架 → status 回 SETUP。 */
export async function resetTournament(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);
  const config = groupKnockout.validate(t.config);

  return db.$transaction(async (tx) => {
    await clearTournamentStructure(tx, input.tournamentId);
    await createSkeletonRecords(tx, input.tournamentId, config);
    const updated = await tx.tournament.update({
      where: { id: input.tournamentId },
      data: { status: 'SETUP' },
    });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.reset',
      entity: 'Tournament',
      entityId: input.tournamentId,
    });
    return updated;
  });
}
