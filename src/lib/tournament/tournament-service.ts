import type { PrismaClient, Tournament, TournamentStatus } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertTournamentWritable } from './guards';
import type { Db, GroupKnockoutConfig } from './types';
import type { CreateTournamentInput } from './tournament-schema';

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

/** 清空赛事结构：阶段（级联组/组队/比赛→局/edges）+ 参赛队快照。调用方保证在事务内。 */
export async function clearTournamentStructure(tx: Db, tournamentId: string): Promise<void> {
  await tx.tournamentStage.deleteMany({ where: { tournamentId } }); // 级联 groups/groupTeams/matches/games/edges
  await tx.tournamentTeam.deleteMany({ where: { tournamentId } });
}

export async function getActiveTournament(db: Db): Promise<Tournament | null> {
  return db.tournament.findFirst({ where: { status: { not: 'ARCHIVED' } } });
}

export async function listTournaments(db: Db): Promise<Tournament[]> {
  return db.tournament.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function archiveActiveTournament(db: Db): Promise<void> {
  const active = await getActiveTournament(db);
  if (!active) return;
  await db.tournament.update({ where: { id: active.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
}

export const BUDGET_EDITABLE_STATUSES: TournamentStatus[] = ['SETUP', 'REGISTRATION', 'ROSTER_LOCKED'];

export async function updateTournamentBudget(db: Db, tournamentId: string, teamBudget: number): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (!BUDGET_EDITABLE_STATUSES.includes(t.status))
    throw new TournamentError('INVALID_STATE', '选秀已开始，队伍预算已锁定，无法修改');
  return db.tournament.update({ where: { id: tournamentId }, data: { teamBudget } });
}

const ALLOWED: Record<TournamentStatus, TournamentStatus[]> = {
  SETUP: ['REGISTRATION'],
  REGISTRATION: ['ROSTER_LOCKED'],
  ROSTER_LOCKED: ['REGISTRATION', 'DRAFTING'],
  DRAFTING: ['GROUPING'],
  GROUPING: ['GROUP_STAGE'],
  GROUP_STAGE: ['KNOCKOUT'],
  KNOCKOUT: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export async function transitionTournament(
  db: Db,
  tournamentId: string,
  next: TournamentStatus,
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (!ALLOWED[t.status].includes(next))
    throw new TournamentError('INVALID_TRANSITION', `不允许的赛事状态变更: ${t.status} → ${next}`);
  return db.tournament.update({ where: { id: tournamentId }, data: { status: next } });
}

export async function createTournament(
  db: PrismaClient,
  input: CreateTournamentInput,
  actorUserId: string,
): Promise<Tournament> {
  const config = groupKnockout.validate(input.config);
  return db.$transaction(async (tx) => {
    await archiveActiveTournament(tx);
    const t = await tx.tournament.create({
      data: { name: input.name, teamBudget: input.teamBudget, kind: input.kind, config, status: 'SETUP' },
    });
    await createSkeletonRecords(tx, t.id, config);
    await writeAudit(tx, {
      userId: actorUserId,
      action: 'tournament.create',
      entity: 'Tournament',
      entityId: t.id,
      payload: { name: input.name, config: config as object },
    });
    return t;
  });
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
  await assertTournamentWritable(db, t.id);

  const wantsName = input.name !== undefined;
  const wantsKind = input.kind !== undefined;
  const wantsConfig = input.config !== undefined;

  if ((wantsName || wantsKind) && t.status === 'FINISHED')
    throw new TournamentError('INVALID_STATE', '赛事已结束，不能修改');
  if (wantsConfig && ['GROUP_STAGE', 'KNOCKOUT', 'FINISHED', 'ARCHIVED'].includes(t.status))
    throw new TournamentError('INVALID_STATE', '小组赛开始后不能修改赛制配置');

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
  await assertTournamentWritable(db, t.id);
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
