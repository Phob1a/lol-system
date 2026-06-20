/**
 * team-page-service.ts — read-only aggregations for the 战队主页 (Screen 6).
 *
 * All functions are pure DB reads — no mutations.
 * Called from: src/app/tournament/team/[teamId]/page.tsx
 */

import type { Db } from './types';
import { championName } from './champions';
import { computeStandings } from './standings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamSlotRow = {
  position: string;
  registrationId: string | null;
  registration: {
    id: string;
    nickname: string;
    isCaptain: boolean;
    cost: number;
    primaryPositions: string[];
  } | null;
};

export type RosterPlayerStats = {
  registrationId: string;
  nickname: string;
  position: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  recentForm: boolean[]; // most-recent first, up to 8
};

export type TeamChampionPoolRow = {
  championId: string;
  championDisplayName: string | null;
  games: number;
  wins: number;
  winRate: number;
};

export type TeamMatchRow = {
  id: string;
  label: string | null;
  scheduledAt: string | null;
  status: string;
  opponentId: string | null;
  opponentName: string | null;
  isWin: boolean | null; // null = not yet played / walkover ambiguous
};

export type TeamRecord = {
  wins: number;
  losses: number;
  points: number;
  rank: number;
  groupName: string | null;
};

/** Normalised 0-1 vector for CompareRadar axes: [kda, winRate, kills, gold, cs] */
export type RadarVector = [number, number, number, number, number];

export type TeamPageData = {
  teamId: string;
  teamName: string;
  slogan: string | null;
  captainNickname: string | null;
  budgetLeft: number;
  record: TeamRecord | null;
  winRate: number; // 0-100
  slots: TeamSlotRow[];
  rosterStats: RosterPlayerStats[];
  champPool: TeamChampionPoolRow[];
  matches: TeamMatchRow[];
  /** Team radar vector (values 0-1) */
  teamRadar: RadarVector;
  /** League-average radar vector (values 0-1) */
  leagueRadar: RadarVector;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Convert raw averages into a 0-1 CompareRadar vector.
 *  Normalisation caps: KDA /6, winRate /100, kills /8, gold /12000, cs /300. */
function toRadar(
  avgKda: number,
  winRate: number,
  avgKills: number,
  avgGold: number,
  avgCs: number,
): RadarVector {
  return [
    clamp01(avgKda / 6),
    clamp01(winRate / 100),
    clamp01(avgKills / 8),
    clamp01(avgGold / 12000),
    clamp01(avgCs / 300),
  ];
}

type PlayerAccEntry = {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  games: number;
  wins: number;
};

// ---------------------------------------------------------------------------
// Main public loader
// ---------------------------------------------------------------------------

export async function getTeamPageData(
  db: Db,
  teamId: string,
  tournamentId: string,
): Promise<TeamPageData | null> {
  // 1. Core team row + slots + captain nickname
  const team = await db.team.findFirst({
    where: { id: teamId, tournamentId },
    include: {
      captain: { select: { nickname: true } },
      slots: {
        include: {
          registration: {
            select: {
              id: true,
              nickname: true,
              isCaptain: true,
              cost: true,
              primaryPositions: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!team) return null;

  // 2. All matches that involve this team in this tournament
  const matchRows = await db.match.findMany({
    where: {
      tournamentId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  // 3. GamePlayerStat for all roster registrations (non-draft games only)
  const registrationIds = team.slots
    .map((s) => s.registration?.id)
    .filter((id): id is string => id != null);

  // Fetch stats for per-player KDA + recent form + champ pool
  const playerGameStats = await db.gamePlayerStat.findMany({
    where: {
      registrationId: { in: registrationIds.length > 0 ? registrationIds : ['__none__'] },
      game: { isDraft: false, match: { tournamentId } },
    },
    select: {
      registrationId: true,
      teamId: true,
      kills: true,
      deaths: true,
      assists: true,
      cs: true,
      gold: true,
      championId: true,
      game: {
        select: {
          winnerTeamId: true,
          match: { select: { scheduledAt: true } },
        },
      },
    },
    orderBy: { game: { match: { scheduledAt: 'desc' } } },
  });

  // 4. Build champion pool map (aggregate across all roster players)
  const champAcc = new Map<string, { wins: number; games: number }>();
  for (const s of playerGameStats) {
    const cur = champAcc.get(s.championId) ?? { wins: 0, games: 0 };
    cur.games++;
    if (s.game.winnerTeamId === s.teamId) cur.wins++;
    champAcc.set(s.championId, cur);
  }
  const champPool: TeamChampionPoolRow[] = [...champAcc.entries()]
    .map(([cId, v]) => ({
      championId: cId,
      championDisplayName: championName(cId),
      games: v.games,
      wins: v.wins,
      winRate: v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 8);

  // 5. Per-registration accumulator (for individual KDA + form)
  const regAccMap = new Map<
    string,
    {
      kills: number; deaths: number; assists: number;
      cs: number; gold: number; games: number; wins: number;
      recentGames: { win: boolean; scheduledAt: Date | null }[];
    }
  >();
  for (const s of playerGameStats) {
    const cur = regAccMap.get(s.registrationId) ?? {
      kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, games: 0, wins: 0, recentGames: [],
    };
    cur.games++;
    cur.kills += s.kills;
    cur.deaths += s.deaths;
    cur.assists += s.assists;
    cur.cs += s.cs;
    cur.gold += s.gold;
    if (s.game.winnerTeamId === s.teamId) cur.wins++;
    cur.recentGames.push({
      win: s.game.winnerTeamId === s.teamId,
      scheduledAt: s.game.match.scheduledAt,
    });
    regAccMap.set(s.registrationId, cur);
  }

  // 6. Build rosterStats list
  const rosterStats: RosterPlayerStats[] = team.slots.map((slot) => {
    const reg = slot.registration;
    if (!reg) {
      return {
        registrationId: '',
        nickname: '空缺',
        position: slot.position,
        games: 0, wins: 0, winRate: 0, kda: 0, recentForm: [],
      };
    }
    const acc = regAccMap.get(reg.id);
    if (!acc || acc.games === 0) {
      return {
        registrationId: reg.id,
        nickname: reg.nickname,
        position: reg.primaryPositions[0] ?? slot.position,
        games: 0, wins: 0, winRate: 0, kda: 0, recentForm: [],
      };
    }
    const recentForm = acc.recentGames
      .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((g) => g.win);
    return {
      registrationId: reg.id,
      nickname: reg.nickname,
      position: reg.primaryPositions[0] ?? slot.position,
      games: acc.games,
      wins: acc.wins,
      winRate: round1((acc.wins / acc.games) * 100),
      kda: round2((acc.kills + acc.assists) / Math.max(1, acc.deaths)),
      recentForm,
    };
  });

  // 7. Team-level radar vector — average over per-registration aggregates
  const regEntries = [...regAccMap.values()].filter((v) => v.games > 0);
  let teamAvgKda = 0, teamWinRate = 0, teamAvgKills = 0, teamAvgGold = 0, teamAvgCs = 0;
  if (regEntries.length > 0) {
    const n = regEntries.length;
    teamAvgKda = round2(regEntries.reduce((s, v) => s + (v.kills + v.assists) / Math.max(1, v.deaths), 0) / n);
    teamWinRate = round1(regEntries.reduce((s, v) => s + (v.wins / v.games) * 100, 0) / n);
    teamAvgKills = round1(regEntries.reduce((s, v) => s + v.kills / v.games, 0) / n);
    teamAvgGold = round1(regEntries.reduce((s, v) => s + v.gold / v.games, 0) / n);
    teamAvgCs = round1(regEntries.reduce((s, v) => s + v.cs / v.games, 0) / n);
  }

  // 8. League-wide average across ALL active registrations in this tournament
  const allStats = await db.gamePlayerStat.findMany({
    where: { game: { isDraft: false, match: { tournamentId } } },
    select: {
      registrationId: true,
      teamId: true,
      kills: true,
      deaths: true,
      assists: true,
      cs: true,
      gold: true,
      game: { select: { winnerTeamId: true } },
    },
  });

  const lgAccMap = new Map<string, PlayerAccEntry>();
  for (const s of allStats) {
    const cur = lgAccMap.get(s.registrationId) ?? {
      kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, games: 0, wins: 0,
    };
    cur.games++;
    cur.kills += s.kills; cur.deaths += s.deaths; cur.assists += s.assists;
    cur.cs += s.cs; cur.gold += s.gold;
    if (s.game.winnerTeamId === s.teamId) cur.wins++;
    lgAccMap.set(s.registrationId, cur);
  }

  let lgKda = 0, lgWr = 0, lgKills = 0, lgGold = 0, lgCs = 0;
  const lgEntries = [...lgAccMap.values()].filter((v) => v.games > 0);
  if (lgEntries.length > 0) {
    const n = lgEntries.length;
    lgKda = round2(lgEntries.reduce((s, v) => s + (v.kills + v.assists) / Math.max(1, v.deaths), 0) / n);
    lgWr = round1(lgEntries.reduce((s, v) => s + (v.wins / v.games) * 100, 0) / n);
    lgKills = round1(lgEntries.reduce((s, v) => s + v.kills / v.games, 0) / n);
    lgGold = round1(lgEntries.reduce((s, v) => s + v.gold / v.games, 0) / n);
    lgCs = round1(lgEntries.reduce((s, v) => s + v.cs / v.games, 0) / n);
  }

  // 9. Group standings for this team
  const groupMembership = await db.tournamentGroupTeam.findFirst({
    where: { teamId },
    include: {
      group: {
        include: {
          teams: { select: { teamId: true } },
          matches: {
            select: {
              teamAId: true,
              teamBId: true,
              winnerTeamId: true,
              status: true,
              countsForStandings: true,
            },
          },
        },
      },
    },
  });

  let record: TeamRecord | null = null;
  if (groupMembership) {
    const grp = groupMembership.group;
    const teamIds = grp.teams.map((t) => t.teamId);
    const rows = computeStandings(
      teamIds,
      grp.matches.map((m) => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        winnerTeamId: m.winnerTeamId,
        status: m.status as 'SCHEDULED' | 'FINISHED' | 'WALKOVER' | 'CANCELED',
        countsForStandings: m.countsForStandings,
      })),
    );
    const myRow = rows.find((r) => r.teamId === teamId);
    if (myRow) {
      record = {
        wins: myRow.wins,
        losses: myRow.losses,
        points: myRow.points,
        rank: myRow.rank,
        groupName: grp.name,
      };
    }
  }

  // 10. Final match rows (for schedule/results table)
  const teamMatches: TeamMatchRow[] = matchRows.map((m) => {
    const isA = m.teamAId === teamId;
    const opp = isA ? m.teamB : m.teamA;
    const isFinished = m.status === 'FINISHED' || m.status === 'WALKOVER';
    const isWin: boolean | null = isFinished ? m.winnerTeamId === teamId : null;
    return {
      id: m.id,
      label: m.label,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status,
      opponentId: opp?.id ?? null,
      opponentName: opp?.name ?? null,
      isWin,
    };
  });

  // 11. Slots shape (serialisable)
  const slots: TeamSlotRow[] = team.slots.map((s) => ({
    position: s.position,
    registrationId: s.registrationId,
    registration: s.registration
      ? {
          id: s.registration.id,
          nickname: s.registration.nickname,
          isCaptain: s.registration.isCaptain,
          cost: s.registration.cost,
          primaryPositions: s.registration.primaryPositions as string[],
        }
      : null,
  }));

  return {
    teamId: team.id,
    teamName: team.name,
    slogan: team.slogan ?? null,
    captainNickname: team.captain.nickname,
    budgetLeft: team.budgetLeft,
    record,
    winRate: teamWinRate,
    slots,
    rosterStats,
    champPool,
    matches: teamMatches,
    teamRadar: toRadar(teamAvgKda, teamWinRate, teamAvgKills, teamAvgGold, teamAvgCs),
    leagueRadar: toRadar(lgKda, lgWr, lgKills, lgGold, lgCs),
  };
}
