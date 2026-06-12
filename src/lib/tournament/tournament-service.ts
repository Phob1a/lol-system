import type { PrismaClient, Tournament } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { Db, GroupKnockoutConfig } from './types';

export async function getTournamentBySeason(db: Db, seasonId: string): Promise<Tournament | null> {
  return db.tournament.findUnique({ where: { seasonId } });
}

export async function createTournament(
  db: PrismaClient,
  input: {
    seasonId: string;
    name: string;
    kind?: string; // 类型标签：正赛/娱乐赛/海斗/自定义；缺省"正赛"
    teamIds: string[];
    config: GroupKnockoutConfig;
    actorUserId: string;
  },
): Promise<Tournament> {
  const config = groupKnockout.validate(input.config);

  const season = await db.season.findUnique({ where: { id: input.seasonId } });
  if (!season) throw new TournamentError('SEASON_NOT_FOUND', '赛季不存在');
  if (await db.tournament.findUnique({ where: { seasonId: input.seasonId } }))
    throw new TournamentError('TOURNAMENT_EXISTS', '该赛季已存在赛事');

  // 跨赛季校验：所有队伍必须属于该赛季
  const teams = await db.team.findMany({
    where: { id: { in: input.teamIds } },
    include: { slots: { where: { registrationId: { not: null } } } },
  });
  if (teams.length !== input.teamIds.length || teams.some((t) => t.seasonId !== input.seasonId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '存在不属于该赛季的队伍');

  const skeleton = groupKnockout.generate(input.teamIds.length, config);

  return db.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: { seasonId: input.seasonId, name: input.name, kind: input.kind ?? '正赛', status: 'SETUP', config },
    });

    // 阵容快照（来自当前 TeamSlot 占用者）
    for (const team of teams) {
      await tx.tournamentTeam.create({
        data: {
          tournamentId: t.id,
          teamId: team.id,
          players: {
            create: team.slots
              .filter((s) => s.registrationId)
              .map((s) => ({ registrationId: s.registrationId! })),
          },
        },
      });
    }

    // 阶段 + 组 + 淘汰赛比赛 + 晋级边（小组赛对阵在 confirmGroups 时生成）
    const matchIdByKey = new Map<string, string>();
    for (const stage of skeleton.stages) {
      const st = await tx.tournamentStage.create({
        data: { tournamentId: t.id, type: stage.type, name: stage.name, order: stage.order, bestOf: stage.bestOf },
      });
      for (const g of stage.groups) {
        await tx.tournamentGroup.create({ data: { stageId: st.id, name: g.name } });
      }
      if (stage.type !== 'KNOCKOUT') continue; // 小组赛对阵在分组确认后才生成
      for (const m of stage.matches) {
        const created = await tx.match.create({
          data: {
            tournamentId: t.id,
            stageId: st.id,
            label: m.label,
            roundKey: m.roundKey,
            bestOf: m.bestOf,
          },
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

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.create',
      entity: 'Tournament',
      entityId: t.id,
      payload: { name: input.name, config: config as object },
    });
    return t;
  });
}

export async function deleteTournament(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await db.$transaction(async (tx) => {
    await tx.tournament.delete({ where: { id: t.id } }); // 全链 Cascade
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.delete',
      entity: 'Tournament',
      entityId: t.id,
      payload: { name: t.name },
    });
  });
}
