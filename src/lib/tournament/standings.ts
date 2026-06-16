export type StandingsMatch = {
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  status: 'SCHEDULED' | 'FINISHED' | 'WALKOVER' | 'CANCELED';
  countsForStandings: boolean;
};

export type StandingsRow = {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  rank: number;
  /** 与同分簇内队伍经头对头仍无法完全定序 */
  tied: boolean;
};

/** 计入积分的完赛：FINISHED 或 WALKOVER，且 countsForStandings */
function counted(ms: StandingsMatch[]): StandingsMatch[] {
  return ms.filter(
    (m) =>
      m.countsForStandings &&
      (m.status === 'FINISHED' || m.status === 'WALKOVER') &&
      m.winnerTeamId !== null && m.teamAId !== null && m.teamBId !== null,
  );
}

function tally(teamIds: string[], played: StandingsMatch[]): Map<string, StandingsRow> {
  const rows = new Map<string, StandingsRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, losses: 0, points: 0, rank: 0, tied: false }]),
  );
  for (const m of played) {
    const a = rows.get(m.teamAId!);
    const b = rows.get(m.teamBId!);
    if (!a || !b) continue;
    a.played++; b.played++;
    const winner = rows.get(m.winnerTeamId!)!;
    const loser = winner === a ? b : a;
    winner.wins++; winner.points++; loser.losses++;
  }
  return rows;
}

export function computeStandings(teamIds: string[], matches: StandingsMatch[]): StandingsRow[] {
  const played = counted(matches);
  const rows = tally(teamIds, played);

  // 先按积分降序聚簇；同分簇内用头对头小子表重排，仍不能全分则整簇标 tied
  const byPoints = [...rows.values()].sort((x, y) => y.points - x.points);
  const result: StandingsRow[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
    const cluster = byPoints.slice(i, j);
    if (cluster.length > 1) {
      const ids = new Set(cluster.map((r) => r.teamId));
      const h2hRows = tally(
        [...ids],
        played.filter((m) => ids.has(m.teamAId!) && ids.has(m.teamBId!)),
      );
      cluster.sort(
        (x, y) => (h2hRows.get(y.teamId)!.points) - (h2hRows.get(x.teamId)!.points),
      );
      const distinct = new Set(cluster.map((r) => h2hRows.get(r.teamId)!.points));
      const fullyOrdered = distinct.size === cluster.length;
      for (const r of cluster) r.tied = !fullyOrdered;
    }
    result.push(...cluster);
    i = j;
  }
  result.forEach((r, idx) => (r.rank = idx + 1));
  return result;
}
