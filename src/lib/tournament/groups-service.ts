import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { GroupKnockoutConfig } from './types';

export async function assignGroups(
  db: PrismaClient,
  input: {
    tournamentId: string;
    assignments: Array<{ groupId: string; teamIds: string[] }>;
    actorUserId: string;
  },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许调整分组');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  // 本赛事的合法 groupId 集合
  const ownGroups = await db.tournamentGroup.findMany({
    where: { stage: { tournamentId: input.tournamentId } },
    select: { id: true },
  });
  const ownGroupIds = new Set(ownGroups.map((g) => g.id));

  // 分组归属 / 不重复 / 全覆盖
  const seenGroupIds = new Set<string>();
  for (const a of input.assignments) {
    if (!ownGroupIds.has(a.groupId)) throw new TournamentError('VALIDATION', '分组不属于该赛事');
    if (seenGroupIds.has(a.groupId)) throw new TournamentError('VALIDATION', '分组重复');
    seenGroupIds.add(a.groupId);
  }
  if (seenGroupIds.size !== ownGroupIds.size) throw new TournamentError('VALIDATION', '有分组未覆盖');

  const cfg = t.config as GroupKnockoutConfig;

  // 覆盖到的全部 teamId = 参赛队集合
  const allTeamIds: string[] = [];
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (a.teamIds.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `每组 ${cfg.teamsPerGroup} 支队伍`);
    for (const id of a.teamIds) {
      if (seen.has(id)) throw new TournamentError('VALIDATION', '队伍重复分组');
      seen.add(id);
      allTeamIds.push(id);
    }
  }
  if (allTeamIds.length !== cfg.groupCount * cfg.teamsPerGroup)
    throw new TournamentError('VALIDATION', '参赛队数量不符');

  // 校验全部属于该赛季，并取当前 TeamSlot 占用者作为快照 players
  const teams = await db.team.findMany({
    where: { id: { in: allTeamIds } },
    include: { slots: { where: { registrationId: { not: null } } } },
  });
  if (teams.length !== allTeamIds.length || teams.some((x) => x.seasonId !== t.seasonId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '存在不属于该赛季的队伍');

  await db.$transaction(async (tx) => {
    // 重建参赛队快照（删旧 → 按当前 slots 重建）
    await tx.tournamentTeam.deleteMany({ where: { tournamentId: t.id } });
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

    // 重写分组成员
    await tx.tournamentGroupTeam.deleteMany({ where: { group: { stage: { tournamentId: t.id } } } });
    for (const a of input.assignments) {
      for (const teamId of a.teamIds) {
        await tx.tournamentGroupTeam.create({ data: { groupId: a.groupId, teamId } });
      }
    }

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.groups.assign',
      entity: 'Tournament',
      entityId: t.id,
    });
  });
}

/** 确认分组：生成组内单循环对阵，状态 SETUP → GROUP_STAGE */
export async function confirmGroups(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      stages: { include: { groups: { include: { teams: true } } } },
    },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许确认分组');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  const cfg = t.config as GroupKnockoutConfig;
  const groupStage = t.stages.find((s) => s.type === 'GROUP')!;
  for (const g of groupStage.groups) {
    if (g.teams.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `${g.name} 组未分满`);
  }

  await db.$transaction(async (tx) => {
    for (const g of groupStage.groups) {
      const ids = g.teams.map((x) => x.teamId);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          await tx.match.create({
            data: {
              tournamentId: t.id,
              stageId: groupStage.id,
              groupId: g.id,
              label: `${g.name} 组`,
              bestOf: cfg.groupBestOf,
              teamAId: ids[a],
              teamBId: ids[b],
            },
          });
        }
      }
    }
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'GROUP_STAGE' } });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.groups.confirm',
      entity: 'Tournament',
      entityId: t.id,
    });
  });
}
