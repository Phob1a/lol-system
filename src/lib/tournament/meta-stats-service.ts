/**
 * meta-stats-service.ts — read-only aggregations for the 数据中心 / DATA CENTER screen.
 *
 * All queries are scoped to the active (non-ARCHIVED) tournament.
 * Returns null when no active tournament exists.
 *
 * Sections provided:
 *   - kpi            — 4 headline KPI tiles
 *   - champHeat      — champion appearance/pick rate TOP 10
 *   - positionMeta   — position distribution from Registration.primaryPositions
 *   - mvpBoard       — top MVP earners (registration + game data)
 *   - powerRanking   — team power ranking from standings + GamePlayerStat averages
 */

import { computeStandings } from './standings';
import { championName } from './champions';
import type { Db } from './types';

// ─── Return types ─────────────────────────────────────────────────────────────

export type MetaKpi = {
  totalGames: number;
  totalPlayers: number;
  totalTeams: number;
  totalChampions: number;
};

export type ChampHeatRow = {
  championId: string;
  name: string;
  games: number;
  wins: number;
  /** Integer percentage, e.g. 58 */
  winRate: number;
};

export type PositionSlice = {
  /** e.g. "上路" */
  label: string;
  /** raw count */
  v: number;
};

export type MvpBoardEntry = {
  registrationId: string;
  nickname: string;
  teamName: string | null;
  mvpCount: number;
};

export type PowerRankRow = {
  teamId: string;
  name: string;
  groupName: string | null;
  wins: number;
  losses: number;
  played: number;
  points: number;
  rank: number;
  /** Average KDA across all player-game stats for this team; null if no games */
  avgKda: number | null;
  /** Average gold per game; null if no games */
  avgGold: number | null;
};

export type MetaStats = {
  kpi: MetaKpi;
  champHeat: ChampHeatRow[];
  positionMeta: PositionSlice[];
  mvpBoard: MvpBoardEntry[];
  powerRanking: PowerRankRow[];
};

// ─── Position label map ───────────────────────────────────────────────────────

const POS_LABEL: Record<string, string> = {
  TOP:     '上路',
  JUNGLE:  '打野',
  MID:     '中路',
  ADC:     '射手',
  SUPPORT: '辅助',
};

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

// ─── Main aggregation ─────────────────────────────────────────────────────────

export async function getMetaStats(db: Db): Promise<MetaStats | null> {
  // 1. Resolve active tournament
  const tournament = await db.tournament.findFirst({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      stages: {
        orderBy: { order: 'asc' },
        select: {
          type: true,
          groups: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              teams: {
                select: { team: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) return null;

  const tournamentId = tournament.id;

  // 2. Parallel data fetches
  const [games, registrations, groupMatches, teamStats] = await Promise.all([
    // Real games (non-draft, within tournament matches)
    db.game.findMany({
      where: {
        isDraft: false,
        match: { tournamentId },
      },
      select: {
        id: true,
        winnerTeamId: true,
        mvpRegistrationId: true,
        playerStats: {
          select: {
            registrationId: true,
            teamId: true,
            championId: true,
            kills: true,
            deaths: true,
            assists: true,
            gold: true,
          },
        },
        bans: {
          select: { championId: true },
        },
      },
    }),
    // All ACTIVE registrations for position meta
    db.registration.findMany({
      where: { tournamentId, status: 'ACTIVE' },
      select: {
        id: true,
        nickname: true,
        primaryPositions: true,
        tournamentRosters: {
          select: {
            tournamentTeam: {
              select: {
                team: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    // All matches (for standings computation)
    db.match.findMany({
      where: { tournamentId },
      select: {
        teamAId: true,
        teamBId: true,
        winnerTeamId: true,
        status: true,
        countsForStandings: true,
        groupId: true,
      },
    }),
    // Team → all their player-game stats for avg KDA + gold
    db.gamePlayerStat.findMany({
      where: {
        game: { isDraft: false, match: { tournamentId } },
      },
      select: {
        teamId: true,
        kills: true,
        deaths: true,
        assists: true,
        gold: true,
      },
    }),
  ]);

  // ── KPI ─────────────────────────────────────────────────────────────────────

  const champSet = new Set<string>();
  for (const g of games) {
    for (const s of g.playerStats) champSet.add(s.championId);
    for (const b of g.bans) champSet.add(b.championId);
  }

  const kpi: MetaKpi = {
    totalGames: games.length,
    totalPlayers: registrations.length,
    totalTeams: new Set(registrations.flatMap(r =>
      r.tournamentRosters.map(ttp => ttp.tournamentTeam.team.id)
    )).size,
    totalChampions: champSet.size,
  };

  // ── Champion heat (appearance / pick count, TOP 10) ──────────────────────────

  type ChampAcc = { wins: number; games: number };
  const champAcc = new Map<string, ChampAcc>();

  for (const g of games) {
    for (const s of g.playerStats) {
      const entry = champAcc.get(s.championId) ?? { wins: 0, games: 0 };
      entry.games++;
      if (g.winnerTeamId && s.teamId === g.winnerTeamId) entry.wins++;
      champAcc.set(s.championId, entry);
    }
  }

  const champHeat: ChampHeatRow[] = [...champAcc.entries()]
    .map(([id, v]) => ({
      championId: id,
      name: championName(id) ?? id,
      games: v.games,
      wins: v.wins,
      winRate: v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 10);

  // ── Position meta ────────────────────────────────────────────────────────────

  const posCounts: Record<string, number> = {};
  for (const pos of POSITIONS) posCounts[pos] = 0;

  for (const reg of registrations) {
    const pos = reg.primaryPositions[0];
    if (pos && posCounts[pos] !== undefined) {
      posCounts[pos]++;
    }
  }

  const positionMeta: PositionSlice[] = POSITIONS
    .filter(p => posCounts[p] > 0)
    .map(p => ({ label: POS_LABEL[p] ?? p, v: posCounts[p] }));

  // ── MVP board ────────────────────────────────────────────────────────────────

  const mvpCounts = new Map<string, number>();
  for (const g of games) {
    if (g.mvpRegistrationId) {
      mvpCounts.set(
        g.mvpRegistrationId,
        (mvpCounts.get(g.mvpRegistrationId) ?? 0) + 1,
      );
    }
  }

  // Build a map registrationId → { nickname, teamName }
  const regMap = new Map(
    registrations.map(r => [
      r.id,
      {
        nickname: r.nickname,
        teamName: r.tournamentRosters[0]?.tournamentTeam.team.name ?? null,
      },
    ]),
  );

  const mvpBoard: MvpBoardEntry[] = [...mvpCounts.entries()]
    .map(([regId, count]) => {
      const info = regMap.get(regId);
      return {
        registrationId: regId,
        nickname: info?.nickname ?? regId,
        teamName: info?.teamName ?? null,
        mvpCount: count,
      };
    })
    .sort((a, b) => b.mvpCount - a.mvpCount)
    .slice(0, 5);

  // ── Power ranking ─────────────────────────────────────────────────────────────

  // Build per-team stat aggregation from GamePlayerStat
  type TeamStatAcc = { kills: number; deaths: number; assists: number; gold: number; count: number };
  const teamStatAcc = new Map<string, TeamStatAcc>();
  for (const s of teamStats) {
    const cur = teamStatAcc.get(s.teamId) ?? { kills: 0, deaths: 0, assists: 0, gold: 0, count: 0 };
    cur.kills += s.kills;
    cur.deaths += s.deaths;
    cur.assists += s.assists;
    cur.gold += s.gold;
    cur.count++;
    teamStatAcc.set(s.teamId, cur);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Collect all teams across all groups
  const groupStage = tournament.stages.find(s => s.type === 'GROUP');
  const allGroupTeams: Array<{ teamId: string; teamName: string; groupName: string }> = [];

  if (groupStage) {
    for (const g of groupStage.groups) {
      for (const t of g.teams) {
        allGroupTeams.push({
          teamId: t.team.id,
          teamName: t.team.name,
          groupName: g.name,
        });
      }
    }
  }

  // If no group stage, fall back to teams referenced in matches
  const allTeamIds = allGroupTeams.length > 0
    ? allGroupTeams.map(t => t.teamId)
    : [...new Set([
        ...groupMatches.flatMap(m => [m.teamAId, m.teamBId].filter((id): id is string => id !== null)),
      ])];

  // Build a teamId → info map
  const teamInfoMap = new Map(allGroupTeams.map(t => [t.teamId, { name: t.teamName, groupName: t.groupName }]));

  // Compute standings per group, then merge
  const standingsMap = new Map<string, { wins: number; losses: number; played: number; points: number; rank: number }>();

  if (groupStage && groupStage.groups.length > 0) {
    for (const g of groupStage.groups) {
      const gTeamIds = g.teams.map(t => t.team.id);
      const gMatches = groupMatches
        .filter(m => gTeamIds.includes(m.teamAId ?? '') || gTeamIds.includes(m.teamBId ?? ''))
        .map(m => ({
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          winnerTeamId: m.winnerTeamId,
          status: m.status as 'SCHEDULED' | 'FINISHED' | 'WALKOVER' | 'CANCELED',
          countsForStandings: m.countsForStandings,
        }));
      const rows = computeStandings(gTeamIds, gMatches);
      for (const row of rows) {
        standingsMap.set(row.teamId, {
          wins: row.wins,
          losses: row.losses,
          played: row.played,
          points: row.points,
          rank: row.rank,
        });
      }
    }
  } else {
    // No group stage: compute flat standings over all matches
    const allMatchesShaped = groupMatches.map(m => ({
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      winnerTeamId: m.winnerTeamId,
      status: m.status as 'SCHEDULED' | 'FINISHED' | 'WALKOVER' | 'CANCELED',
      countsForStandings: m.countsForStandings,
    }));
    const rows = computeStandings(allTeamIds, allMatchesShaped);
    for (const row of rows) {
      standingsMap.set(row.teamId, {
        wins: row.wins,
        losses: row.losses,
        played: row.played,
        points: row.points,
        rank: row.rank,
      });
    }
  }

  const powerRanking: PowerRankRow[] = allTeamIds
    .map(teamId => {
      const info = teamInfoMap.get(teamId);
      const standing = standingsMap.get(teamId);
      const stats = teamStatAcc.get(teamId);

      const avgKda = stats && stats.count > 0
        ? round2((stats.kills + stats.assists) / Math.max(1, stats.deaths))
        : null;
      const avgGold = stats && stats.count > 0
        ? Math.round(stats.gold / stats.count)
        : null;

      return {
        teamId,
        name: info?.name ?? teamId,
        groupName: info?.groupName ?? null,
        wins: standing?.wins ?? 0,
        losses: standing?.losses ?? 0,
        played: standing?.played ?? 0,
        points: standing?.points ?? 0,
        rank: standing?.rank ?? 999,
        avgKda,
        avgGold,
      };
    })
    .sort((a, b) => {
      // Primary: points desc; secondary: KDA desc; tertiary: name
      if (b.points !== a.points) return b.points - a.points;
      if ((b.avgKda ?? 0) !== (a.avgKda ?? 0)) return (b.avgKda ?? 0) - (a.avgKda ?? 0);
      return a.name.localeCompare(b.name);
    });

  return {
    kpi,
    champHeat,
    positionMeta,
    mvpBoard,
    powerRanking,
  };
}
