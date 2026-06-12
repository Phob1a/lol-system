import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import type { GroupKnockoutConfig } from './types';

export async function assignGroups(
  db: PrismaClient,
  input: {
    tournamentId: string;
    assignments: Array<{ groupId: string; teamIds: string[] }>;
    actorUserId: string;
  },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, include: { teams: true } });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'SETUP') throw new TournamentError('INVALID_STATE', '当前状态不允许调整分组');

  const cfg = t.config as GroupKnockoutConfig;
  const snapshotTeamIds = new Set(t.teams.map((x) => x.teamId));
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (a.teamIds.length !== cfg.teamsPerGroup)
      throw new TournamentError('VALIDATION', `每组 ${cfg.teamsPerGroup} 支队伍`);
    for (const id of a.teamIds) {
      if (!snapshotTeamIds.has(id)) throw new TournamentError('TEAM_NOT_IN_SEASON', '队伍不在参赛名单');
      if (seen.has(id)) throw new TournamentError('VALIDATION', '队伍重复分组');
      seen.add(id);
    }
  }
  if (seen.size !== snapshotTeamIds.size) throw new TournamentError('VALIDATION', '有队伍未分组');

  await db.$transaction(async (tx) => {
    await tx.tournamentGroupTeam.deleteMany({
      where: { group: { stage: { tournamentId: t.id } } },
    });
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
