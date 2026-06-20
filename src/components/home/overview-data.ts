/**
 * overview-data.ts — Server-side data fetcher for the Overview dashboard.
 * Assembles all props needed by OverviewDashboard from real Prisma queries.
 * Called in src/app/page.tsx (server component). Never import in client code.
 */

import type { PrismaClient } from '@prisma/client';
import { getPublicTournamentState } from '@/lib/tournament/read-model';
import { listPlayerTournamentProfiles } from '@/lib/tournament/player-stats-service';
import type { GroupBarsRow } from '@/components/nexus/charts/GroupBars';

export type OverviewLeaderboardEntry = {
  playerId: string;
  nickname: string;
  teamName: string | null;
  primaryPosition: string | null;
  kda: number;
  recentForm: boolean[];
};

export type OverviewStandingsGroup = {
  groupId: string;
  name: string;
  rows: GroupBarsRow[];
};

export type OverviewTeamNode = {
  id: string;
  name: string;
  label: string;
};

/** One entry in the today's-timeline strip. */
export type TodayTimelineEntry = {
  matchId: string;
  /** HH:MM local string */
  time: string;
  teamAName: string | null;
  teamBName: string | null;
  finished: boolean;
};

/** One entry in the MVP strip. */
export type MvpStripEntry = {
  registrationId: string;
  nickname: string;
  teamName: string | null;
  mvpCount: number;
};

/** Data for the TopTeamsCompare radar. null when not enough teams/stats exist. */
export type TopTeamsCompareData = {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  /** 5-value array [kda,winRate,kills,gold,cs] each normalised 0-1 */
  teamAValues: [number, number, number, number, number];
  teamBValues: [number, number, number, number, number];
} | null;

export type OverviewProps = {
  tournamentName: string;
  tournamentStatus: string;
  tournamentKind: string;
  /** Total matches in the tournament */
  matchCount: number;
  /** Finished matches */
  finishedCount: number;
  /** Active player registrations */
  registrationCount: number;
  /** Players willing to captain */
  captainIntentionCount: number;
  /** Number of teams */
  teamCount: number;
  /** Draft session status string */
  draftStatus: string;
  /** Standings per group, mapped to GroupBars rows */
  standings: OverviewStandingsGroup[];
  /** Up to 8 teams for the Orrery */
  teams: OverviewTeamNode[];
  /** Top 6 players by KDA */
  leaderboard: OverviewLeaderboardEntry[];
  /** Trajectory points (cumulative finished count over match sequence) */
  trajectoryPoints: number[];
  /** Current trajectory index (index of last finished match) */
  trajectoryCurrentIndex: number;
  /** Today's matches (or busiest day's if no matches today) for the timeline strip */
  todayTimeline: TodayTimelineEntry[];
  /** Top 3 MVP earners */
  mvpStrip: MvpStripEntry[];
  /** Top-two-teams radar comparison; null when < 2 teams with stats */
  topTeamsCompare: TopTeamsCompareData;
};

export type OverviewPageData =
  | { kind: 'no-tournament' }
  | {
      kind: 'pre-tournament';
      registrationCount: number;
      captainIntentionCount: number;
      tournamentName: string;
      tournamentStatus: string;
    }
  | { kind: 'overview'; props: OverviewProps };

const PRE_STATUSES = new Set(['SETUP', 'REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING']);

export async function fetchOverviewData(
  db: PrismaClient,
  tournamentId: string,
  tournamentName: string,
  tournamentKind: string,
  tournamentStatus: string,
): Promise<OverviewPageData> {
  // For pre-tournament statuses show a simpler view
  if (PRE_STATUSES.has(tournamentStatus)) {
    const [registrationCount, captainIntentionCount] = await Promise.all([
      db.registration.count({ where: { tournamentId, status: 'ACTIVE' } }),
      db.registration.count({
        where: { tournamentId, status: 'ACTIVE', willingToCaptain: true },
      }),
    ]);
    return {
      kind: 'pre-tournament',
      registrationCount,
      captainIntentionCount,
      tournamentName,
      tournamentStatus,
    };
  }

  // Full overview for GROUP_STAGE / KNOCKOUT / FINISHED
  const [state, profiles] = await Promise.all([
    getPublicTournamentState(db, tournamentId),
    listPlayerTournamentProfiles(db, tournamentId),
  ]);

  if (!state) return { kind: 'no-tournament' };

  const allMatches = state.matches;
  const matchCount = allMatches.length;
  const finishedCount = allMatches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'WALKOVER',
  ).length;

  const [registrationCount, captainIntentionCount] = await Promise.all([
    db.registration.count({ where: { tournamentId, status: 'ACTIVE' } }),
    db.registration.count({
      where: { tournamentId, status: 'ACTIVE', willingToCaptain: true },
    }),
  ]);

  // Team count from standings
  const allTeamIds = new Set<string>();
  state.standings.forEach((g) => Object.keys(g.teams).forEach((id) => allTeamIds.add(id)));
  const teamCount = allTeamIds.size;

  // Standings mapped to GroupBars rows
  const standings: OverviewStandingsGroup[] = state.standings.map((g) => ({
    groupId: g.groupId,
    name: g.name,
    rows: g.rows.map((r) => ({
      rank: r.rank,
      name: g.teams[r.teamId] ?? r.teamId,
      points: r.points,
      wins: r.wins,
      losses: r.losses,
    })),
  }));

  // Orrery bodies: deduplicate teams from standings, max 8
  const teamsForOrrery: OverviewTeamNode[] = [];
  const seenIds = new Set<string>();
  for (const g of state.standings) {
    for (const [id, name] of Object.entries(g.teams)) {
      if (!seenIds.has(id) && teamsForOrrery.length < 8) {
        seenIds.add(id);
        teamsForOrrery.push({ id, name, label: name.slice(0, 2).toUpperCase() });
      }
    }
  }

  // Top 6 leaderboard entries (already sorted by KDA in listPlayerTournamentProfiles)
  const leaderboard: OverviewLeaderboardEntry[] = profiles.slice(0, 6).map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    teamName: p.teamName,
    primaryPosition: p.primaryPosition,
    kda: p.summary.kda,
    recentForm: p.recentForm.slice(0, 5),
  }));

  // Trajectory: cumulative finished-match count over the sorted match sequence
  const sortedMatches = [...allMatches].sort(
    (a, b) =>
      (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0) -
      (b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0),
  );
  let cumulativeFinished = 0;
  const trajectoryPoints = sortedMatches.map((m) => {
    if (m.status === 'FINISHED' || m.status === 'WALKOVER') cumulativeFinished++;
    return cumulativeFinished;
  });
  const trajectoryCurrentIndex = Math.max(0, finishedCount - 1);

  // Draft status
  const draftSession = await db.draftSession.findUnique({
    where: { tournamentId },
    select: { status: true },
  });
  const draftStatus = draftSession?.status ?? 'NOT_STARTED';

  // ── TodayTimeline ──────────────────────────────────────────────────────────
  // Find today's matches (UTC date). If none exist today, fall back to the
  // day with the most matches (as the prototype does).
  const todayUtc = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const scheduledMatches = allMatches.filter((m) => m.scheduledAt != null);

  const matchesByDay = new Map<string, typeof scheduledMatches>();
  for (const m of scheduledMatches) {
    const day = m.scheduledAt!.slice(0, 10);
    if (!matchesByDay.has(day)) matchesByDay.set(day, []);
    matchesByDay.get(day)!.push(m);
  }

  let timelineMatches: typeof scheduledMatches = [];
  if (matchesByDay.has(todayUtc)) {
    timelineMatches = matchesByDay.get(todayUtc)!;
  } else if (matchesByDay.size > 0) {
    // Fall back to busiest day
    let best: typeof scheduledMatches = [];
    for (const arr of matchesByDay.values()) {
      if (arr.length > best.length) best = arr;
    }
    timelineMatches = best;
  }

  const todayTimeline: TodayTimelineEntry[] = timelineMatches
    .slice()
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
    .slice(0, 6)
    .map((m) => {
      const d = new Date(m.scheduledAt!);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return {
        matchId: m.id,
        time: `${hh}:${mm}`,
        teamAName: m.teamA?.name ?? null,
        teamBName: m.teamB?.name ?? null,
        finished: m.status === 'FINISHED' || m.status === 'WALKOVER',
      };
    });

  // ── MvpStrip ───────────────────────────────────────────────────────────────
  // Use the player profiles (already computed above) to derive MVP counts.
  // Sort by mvpCount desc and take top 3.
  const mvpStrip: MvpStripEntry[] = profiles
    .filter((p) => p.summary.mvpCount > 0)
    .sort((a, b) => b.summary.mvpCount - a.summary.mvpCount)
    .slice(0, 3)
    .map((p) => ({
      registrationId: p.registrationId ?? p.playerId,
      nickname: p.nickname,
      teamName: p.teamName,
      mvpCount: p.summary.mvpCount,
    }));

  // ── TopTeamsCompare ────────────────────────────────────────────────────────
  // Compare the top two teams from the overall power ranking (by points then KDA).
  // Normalise 5 dimensions: KDA /6, winRate /100, avgKills /8, avgGold /16000, avgCs /300.
  let topTeamsCompare: TopTeamsCompareData = null;

  // Gather per-team player-stat averages from the profiles list.
  // Match player → team by name via the teamsForOrrery list (which already
  // has the canonical id→name mapping from standings).
  type TeamAgg = { kdaSum: number; killsSum: number; goldSum: number; csSum: number; players: number; wins: number; games: number };
  const teamAggMap = new Map<string, TeamAgg>();
  // Build a fast name→id lookup from teamsForOrrery.
  const teamNameToId = new Map(teamsForOrrery.map((t) => [t.name, t.id]));
  for (const p of profiles) {
    const teamId = p.teamName ? (teamNameToId.get(p.teamName) ?? null) : null;
    if (!teamId) continue;
    const cur = teamAggMap.get(teamId) ?? { kdaSum: 0, killsSum: 0, goldSum: 0, csSum: 0, players: 0, wins: 0, games: 0 };
    cur.kdaSum += p.summary.kda;
    cur.killsSum += p.summary.avgKills;
    cur.goldSum += p.summary.avgGold;
    cur.csSum += p.summary.avgCs;
    cur.wins += p.summary.wins;
    cur.games += p.summary.games;
    cur.players++;
    teamAggMap.set(teamId, cur);
  }

  // Power rank: sort by points from standings, then by avg KDA.
  const powerRankedTeams = [...allTeamIds]
    .map((id) => {
      const name = (() => {
        for (const g of state.standings) { if (g.teams[id]) return g.teams[id]; }
        return id;
      })();
      const standingRow = state.standings.flatMap((g) => g.rows).find((r) => r.teamId === id);
      const agg = teamAggMap.get(id);
      return { id, name, points: standingRow?.points ?? 0, agg };
    })
    .sort((a, b) => b.points - a.points || ((b.agg?.kdaSum ?? 0) / Math.max(1, b.agg?.players ?? 1)) - ((a.agg?.kdaSum ?? 0) / Math.max(1, a.agg?.players ?? 1)));

  if (powerRankedTeams.length >= 2) {
    const t1 = powerRankedTeams[0];
    const t2 = powerRankedTeams[1];
    const norm = (agg: TeamAgg | undefined): [number, number, number, number, number] => {
      if (!agg || agg.players === 0) return [0.5, 0.5, 0.5, 0.5, 0.5];
      const n = agg.players;
      const winRate = agg.games > 0 ? agg.wins / agg.games : 0.5;
      return [
        Math.min(1, (agg.kdaSum / n) / 6),
        winRate,
        Math.min(1, (agg.killsSum / n) / 8),
        Math.min(1, (agg.goldSum / n) / 16000),
        Math.min(1, (agg.csSum / n) / 300),
      ];
    };
    topTeamsCompare = {
      teamAId: t1.id,
      teamAName: t1.name,
      teamBId: t2.id,
      teamBName: t2.name,
      teamAValues: norm(t1.agg),
      teamBValues: norm(t2.agg),
    };
  }

  return {
    kind: 'overview',
    props: {
      tournamentName,
      tournamentStatus,
      tournamentKind,
      matchCount,
      finishedCount,
      registrationCount,
      captainIntentionCount,
      teamCount,
      draftStatus,
      standings,
      teams: teamsForOrrery,
      leaderboard,
      trajectoryPoints: trajectoryPoints.length >= 2 ? trajectoryPoints : [],
      trajectoryCurrentIndex,
      todayTimeline,
      mvpStrip,
      topTeamsCompare,
    },
  };
}
