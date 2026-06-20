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
    },
  };
}
