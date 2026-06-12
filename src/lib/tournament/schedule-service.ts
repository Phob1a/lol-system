import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';

export async function addCustomMatch(
  db: PrismaClient,
  input: {
    tournamentId: string;
    groupId: string | null;
    teamAId: string;
    teamBId: string;
    bestOf: number;
    label: string;
    countsForStandings: boolean;
    scheduledAt?: Date | null;
    actorUserId: string;
  },
): Promise<Match> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { teams: true, stages: { include: { groups: { include: { teams: true } } } } },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  await assertSeasonWritableBySeasonId(db, t.seasonId);
  if (t.status === 'FINISHED') throw new TournamentError('INVALID_STATE', '赛事已结束');
  if (input.teamAId === input.teamBId) throw new TournamentError('VALIDATION', '双方不能相同');
  if (![1, 3, 5].includes(input.bestOf)) throw new TournamentError('VALIDATION', 'BO 数非法');

  const snapshot = new Set(t.teams.map((x) => x.teamId));
  if (!snapshot.has(input.teamAId) || !snapshot.has(input.teamBId))
    throw new TournamentError('TEAM_NOT_IN_SEASON', '队伍不在参赛名单');

  let stageId: string;
  if (input.groupId) {
    const group = t.stages.flatMap((s) => s.groups).find((g) => g.id === input.groupId);
    if (!group) throw new TournamentError('VALIDATION', '小组不存在');
    const memberIds = new Set(group.teams.map((x) => x.teamId));
    if (!memberIds.has(input.teamAId) || !memberIds.has(input.teamBId))
      throw new TournamentError('VALIDATION', '加赛双方必须同组');
    stageId = group.stageId;
  } else {
    // 不挂组：放到 KNOCKOUT 阶段名下（仅作归属展示）
    stageId = t.stages.find((s) => s.type === 'KNOCKOUT')!.id;
  }

  return db.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        tournamentId: t.id,
        stageId,
        groupId: input.groupId,
        label: input.label,
        bestOf: input.bestOf,
        source: 'CUSTOM',
        countsForStandings: input.countsForStandings,
        teamAId: input.teamAId,
        teamBId: input.teamBId,
        scheduledAt: input.scheduledAt ?? null,
      },
    });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.custom.create',
      entity: 'Match', entityId: m.id,
      payload: { label: input.label, countsForStandings: input.countsForStandings },
    });
    return m;
  });
}
