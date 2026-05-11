export interface StandingMatch {
  id: string;
  phase: string;
  groupId: string | null;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
}

export interface StandingRow {
  teamId: string;
  wins: number;
  losses: number;
  points: number;
}

export interface TieGroup {
  groupId: string;
  tiedTeamIds: string[];
}

export interface StandingsResult {
  byGroup: Record<string, StandingRow[]>;
  tieGroups: TieGroup[];
}

function isCounted(m: StandingMatch): boolean {
  return (m.status === 'FINISHED' || m.status === 'WALKOVER') && !!m.winnerTeamId;
}

export function computeStandings(matches: StandingMatch[]): StandingsResult {
  const counted = matches.filter(
    m => m.groupId && (m.phase === 'GROUP' || m.phase === 'TIEBREAKER') && isCounted(m),
  );

  const teamsByGroup = new Map<string, Set<string>>();
  const wlByGroup = new Map<string, Map<string, { wins: number; losses: number }>>();

  for (const m of counted) {
    const g = m.groupId!;
    if (!teamsByGroup.has(g)) teamsByGroup.set(g, new Set());
    if (!wlByGroup.has(g)) wlByGroup.set(g, new Map());
    teamsByGroup.get(g)!.add(m.teamAId!);
    teamsByGroup.get(g)!.add(m.teamBId!);

    const wl = wlByGroup.get(g)!;
    const winner = m.winnerTeamId!;
    const loser = winner === m.teamAId ? m.teamBId! : m.teamAId!;
    if (!wl.has(winner)) wl.set(winner, { wins: 0, losses: 0 });
    if (!wl.has(loser)) wl.set(loser, { wins: 0, losses: 0 });

    // TIEBREAKER matches are used ONLY for ordering, not for W/L totals.
    if (m.phase === 'GROUP') {
      wl.get(winner)!.wins++;
      wl.get(loser)!.losses++;
    }
  }

  const byGroup: Record<string, StandingRow[]> = {};
  const tieGroups: TieGroup[] = [];

  for (const [gId, teams] of teamsByGroup) {
    const wl = wlByGroup.get(gId)!;
    const rows: StandingRow[] = [];
    for (const tId of teams) {
      const r = wl.get(tId) ?? { wins: 0, losses: 0 };
      rows.push({ teamId: tId, wins: r.wins, losses: r.losses, points: r.wins });
    }
    rows.sort((a, b) => b.wins - a.wins);

    const sorted: StandingRow[] = [];
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j].wins === rows[i].wins) j++;
      const bucket = rows.slice(i, j);
      if (bucket.length === 1) {
        sorted.push(bucket[0]);
      } else {
        const resolved = resolveTieBucket(bucket, counted, gId);
        if (resolved) {
          sorted.push(...resolved);
        } else {
          sorted.push(...bucket);
          tieGroups.push({ groupId: gId, tiedTeamIds: bucket.map(b => b.teamId) });
        }
      }
      i = j;
    }
    byGroup[gId] = sorted;
  }

  return { byGroup, tieGroups };
}

function resolveTieBucket(
  bucket: StandingRow[],
  matches: StandingMatch[],
  groupId: string,
): StandingRow[] | null {
  const ids = new Set(bucket.map(b => b.teamId));
  const subWins = new Map<string, number>();
  for (const tId of ids) subWins.set(tId, 0);
  for (const m of matches) {
    if (m.groupId !== groupId) continue;
    if (!m.teamAId || !m.teamBId || !m.winnerTeamId) continue;
    if (!ids.has(m.teamAId) || !ids.has(m.teamBId)) continue;
    subWins.set(m.winnerTeamId, (subWins.get(m.winnerTeamId) ?? 0) + 1);
  }

  // Sort by sub-wins descending, then recursively resolve any remaining sub-buckets.
  const rankedBucket = [...bucket].sort(
    (a, b) => (subWins.get(b.teamId)! - subWins.get(a.teamId)!),
  );

  const resolved: StandingRow[] = [];
  let i = 0;
  while (i < rankedBucket.length) {
    let j = i;
    while (j < rankedBucket.length && subWins.get(rankedBucket[j].teamId)! === subWins.get(rankedBucket[i].teamId)!) j++;
    const subBucket = rankedBucket.slice(i, j);
    if (subBucket.length === 1) {
      resolved.push(subBucket[0]);
    } else if (subBucket.length === bucket.length) {
      // No progress was made — the entire bucket is still tied; flag it.
      return null;
    } else {
      // Recurse into the sub-bucket.
      const subResolved = resolveTieBucket(subBucket, matches, groupId);
      if (subResolved) {
        resolved.push(...subResolved);
      } else {
        return null;
      }
    }
    i = j;
  }
  return resolved;
}
