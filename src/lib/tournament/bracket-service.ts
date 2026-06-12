import type { PrismaClient } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { computeStandings } from './standings';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritableBySeasonId } from './guards';
import type { GroupKnockoutConfig } from './types';

/** 收小组：校验全部完赛、出线名次无 tie，按 seedMap 填首轮，状态 → KNOCKOUT */
export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      stages: {
        include: {
          groups: { include: { teams: true }, orderBy: { name: 'asc' } },
          matches: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (t.status !== 'GROUP_STAGE') throw new TournamentError('INVALID_STATE', '当前状态不能收小组');
  await assertSeasonWritableBySeasonId(db, t.seasonId);

  const cfg = t.config as GroupKnockoutConfig;
  const groupStage = t.stages.find((s) => s.type === 'GROUP')!;

  // 各组名次 → 出线者
  const advancerByKey = new Map<string, string>(); // "{组序}-{名次}" → teamId
  for (let g = 0; g < groupStage.groups.length; g++) {
    const group = groupStage.groups[g];
    const ms = groupStage.matches.filter((m) => m.groupId === group.id);
    if (ms.some((m) => m.status === 'SCHEDULED'))
      throw new TournamentError('INVALID_STATE', `${group.name} 组比赛未完成`);
    const rows = computeStandings(
      group.teams.map((x) => x.teamId),
      ms.map((m) => ({
        teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
        status: m.status, countsForStandings: m.countsForStandings,
      })),
    );
    for (let rank = 1; rank <= cfg.advancingPerGroup; rank++) {
      const row = rows[rank - 1];
      if (row.tied)
        throw new TournamentError('STANDINGS_TIED', `${group.name} 组名次并列无法出线，请安排加赛`);
      advancerByKey.set(`${g}-${rank}`, row.teamId);
    }
  }

  // skeleton 的 seedMap → DB match：用 (roundKey, label) 对齐
  const skeleton = groupKnockout.generate(cfg.groupCount * cfg.teamsPerGroup, cfg);
  const koStage = t.stages.find((s) => s.type === 'KNOCKOUT')!;
  const skeletonKo = skeleton.stages.find((s) => s.type === 'KNOCKOUT')!.matches;
  const dbIdByKey = new Map<string, string>();
  for (const sm of skeletonKo) {
    const dbm = koStage.matches.find((m) => m.roundKey === sm.roundKey && m.label === sm.label);
    if (!dbm) throw new TournamentError('INVALID_STATE', '淘汰赛骨架与库不一致');
    dbIdByKey.set(sm.key, dbm.id);
  }

  await db.$transaction(async (tx) => {
    for (const [seedKey, target] of Object.entries(skeleton.seedMap)) {
      const teamId = advancerByKey.get(seedKey);
      if (!teamId) continue;
      await tx.match.update({
        where: { id: dbIdByKey.get(target.matchKey)! },
        data: target.slot === 'A' ? { teamAId: teamId } : { teamBId: teamId },
      });
    }
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'KNOCKOUT' } });
    await writeAudit(tx, {
      userId: input.actorUserId, action: 'tournament.groupstage.close',
      entity: 'Tournament', entityId: t.id,
    });
  });
}
