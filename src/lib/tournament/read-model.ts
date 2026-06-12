import { getActiveSeason } from '@/lib/season/season-service';
import { championName } from './champions';
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
    tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status }, // 去 config
    matches: t.matches.map((m) => ({
      id: m.id, label: m.label, roundKey: m.roundKey, bestOf: m.bestOf,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status, isWalkover: m.isWalkover,
      teamA: m.teamA, teamB: m.teamB, winnerTeamId: m.winnerTeamId,
      groupId: m.groupId, // 去 version
    })),
    standings,
    bracket,
  };
}

/** 管理端读模型：公开形状 + version + config + 每局摘要（isDraft/hasBans/hasStats）。null = 无赛事 */
export async function getAdminTournamentState(db: Db, seasonId: string) {
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
          games: {
            orderBy: { index: 'asc' },
            include: { _count: { select: { bans: true, playerStats: true } } },
          },
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
      games: m.games.map((g) => ({
        id: g.id, index: g.index, isDraft: g.isDraft, winnerTeamId: g.winnerTeamId,
        hasBans: g._count.bans > 0,
        hasStats: g._count.playerStats === 10,
      })),
    })),
    standings,
    bracket,
  };
}

/** 公开比赛详情：非草稿局完整明细（禁用、数据、MVP）+ 解析映射。null = 非活跃赛季或比赛不存在 */
export async function getPublicMatchDetail(db: Db, matchId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      tournament: { select: { seasonId: true } },
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      games: {
        where: { isDraft: false },
        orderBy: { index: 'asc' },
        include: {
          bans: { orderBy: { order: 'asc' } },
          playerStats: {
            include: {
              registration: { select: { id: true, nickname: true, playerId: true } },
            },
          },
        },
      },
    },
  });
  if (!match) return null;

  const active = await getActiveSeason(db);
  if (!active || match.tournament.seasonId !== active.id) return null;

  return {
    id: match.id, label: match.label, roundKey: match.roundKey, bestOf: match.bestOf,
    status: match.status, scheduledAt: match.scheduledAt?.toISOString() ?? null,
    teamA: match.teamA, teamB: match.teamB, winnerTeamId: match.winnerTeamId,
    games: match.games.map((g) => ({
      id: g.id, index: g.index, blueTeamId: g.blueTeamId, winnerTeamId: g.winnerTeamId,
      durationSeconds: g.durationSeconds, mvpRegistrationId: g.mvpRegistrationId,
      bans: g.bans.map((b) => ({
        teamId: b.teamId, type: b.type, championId: b.championId,
        championName: championName(b.championId), order: b.order,
      })),
      players: g.playerStats.map((s) => ({
        registrationId: s.registrationId,
        playerId: s.registration.playerId,
        nickname: s.registration.nickname,
        teamId: s.teamId, championId: s.championId,
        championName: championName(s.championId),
        kills: s.kills, deaths: s.deaths, assists: s.assists,
        cs: s.cs, damage: s.damage, gold: s.gold,
      })),
    })),
  };
}
