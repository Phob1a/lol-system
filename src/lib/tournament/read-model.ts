import { computeStandings } from './standings';
import { buildBracket } from './bracket';
import type { Db } from './types';

/** 公开页完整读模型：赛程 + 各组积分榜 + 对阵树。null = 无赛事 */
export async function getPublicTournamentState(db: Db, seasonId: string) {
  const t = await db.tournament.findUnique({
    where: { seasonId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          groups: {
            orderBy: { name: 'asc' },
            include: { teams: { include: { team: { select: { id: true, name: true } } } } },
          },
        },
      },
      matches: {
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!t) return null;

  const groupStage = t.stages.find((s) => s.type === 'GROUP');
  const standings = (groupStage?.groups ?? []).map((g) => ({
    groupId: g.id,
    name: g.name,
    teams: Object.fromEntries(g.teams.map((x) => [x.team.id, x.team.name])),
    rows: computeStandings(
      g.teams.map((x) => x.team.id),
      t.matches
        .filter((m) => m.groupId === g.id)
        .map((m) => ({
          teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
          status: m.status, countsForStandings: m.countsForStandings,
        })),
    ),
  }));

  const bracket = buildBracket(
    t.matches
      .filter((m) => m.roundKey !== null)
      .map((m) => ({
        id: m.id, roundKey: m.roundKey, label: m.label,
        teamAId: m.teamAId, teamBId: m.teamBId,
        winnerTeamId: m.winnerTeamId, status: m.status,
      })),
  );

  return {
    tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status, config: t.config },
    matches: t.matches.map((m) => ({
      id: m.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status, isWalkover: m.isWalkover,
      teamA: m.teamA, teamB: m.teamB, winnerTeamId: m.winnerTeamId,
      groupId: m.groupId, version: m.version,
    })),
    standings,
    bracket,
  };
}
