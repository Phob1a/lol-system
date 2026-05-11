import type { PrismaClient } from '@prisma/client';
import { computeStandings, type StandingsResult } from './standings-service';
import {
  computeSeriesScore,
  winsNeeded,
  type GameRow,
} from './series-format';

export interface MatchView {
  id: string;
  phase: string;
  format: string;
  status: string;
  groupId: string | null;
  roundIndex: number | null;
  matchIndex: number | null;
  nextMatchId: string | null;
  nextSide: string | null;
  teamAId: string | null;
  teamBId: string | null;
  scheduledAt: string | null;
  winnerTeamId: string | null;
  walkoverNote: string | null;
  seriesScore: { a: number; b: number };
  winsNeeded: number;
  games: Array<{ gameNumber: number; winnerTeamId: string }>;
}

export interface TournamentState {
  tournament: {
    id: string;
    name: string;
    status: string;
    groupCount: number;
    teamsPerGroup: number;
    advancingPerGroup: number;
    seq: number;
    championId: string | null;
  };
  groups: Array<{
    id: string;
    letter: string;
    teams: Array<{ teamId: string; name: string; seed: number }>;
  }>;
  matches: MatchView[];
  standings: StandingsResult;
  schedule: MatchView[];
}

export async function getTournamentState(
  db: PrismaClient,
  tournamentId: string,
): Promise<TournamentState | null> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: { include: { teams: { include: { team: true } } } },
      matches: { include: { games: { orderBy: { gameNumber: 'asc' } } } },
    },
  });
  if (!t) return null;

  const matches: MatchView[] = t.matches.map((m) => {
    const games: GameRow[] = m.games.map((g) => ({ winnerTeamId: g.winnerTeamId }));
    const seriesScore =
      m.teamAId && m.teamBId
        ? computeSeriesScore(games, m.teamAId, m.teamBId)
        : { a: 0, b: 0 };
    return {
      id: m.id,
      phase: m.phase,
      format: m.format,
      status: m.status,
      groupId: m.groupId,
      roundIndex: m.roundIndex,
      matchIndex: m.matchIndex,
      nextMatchId: m.nextMatchId,
      nextSide: m.nextSide,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      winnerTeamId: m.winnerTeamId,
      walkoverNote: m.walkoverNote,
      seriesScore,
      winsNeeded: winsNeeded(m.format),
      games: m.games.map((g) => ({ gameNumber: g.gameNumber, winnerTeamId: g.winnerTeamId })),
    };
  });

  const standings = computeStandings(
    t.matches.map((m) => ({
      id: m.id,
      phase: m.phase,
      groupId: m.groupId,
      status: m.status,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      winnerTeamId: m.winnerTeamId,
    })),
  );

  const schedule = [...matches].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt < b.scheduledAt ? -1 : 1;
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return 0;
  });

  return {
    tournament: {
      id: t.id,
      name: t.name,
      status: t.status,
      groupCount: t.groupCount,
      teamsPerGroup: t.teamsPerGroup,
      advancingPerGroup: t.advancingPerGroup,
      seq: t.seq,
      championId: t.championId,
    },
    groups: t.groups.map((g) => ({
      id: g.id,
      letter: g.letter,
      teams: g.teams.map((gt) => ({
        teamId: gt.teamId,
        name: gt.team.name,
        seed: gt.seed,
      })),
    })),
    matches,
    standings,
    schedule,
  };
}
