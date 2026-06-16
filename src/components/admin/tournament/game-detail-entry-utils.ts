export type BanRowDraft = {
  teamId: string;
  championId: string | null;
};

export type StatRowDraft = {
  registrationId: string;
  nickname: string;
  championId: string | null;
  kda: string;
  cs: string;
  damage: string;
  gold: string;
};

export type Kda = {
  kills: number;
  deaths: number;
  assists: number;
};

export type PickDraft = {
  teamId: string;
  type: 'PICK';
  championId: string;
};

export type BanPickPayload = {
  teamId: string;
  type: 'BAN' | 'PICK';
  championId: string;
  order: number;
};

export type ChampionDuplicateInput = {
  source: 'ban' | 'pick' | 'stat';
  label: string;
  championId: string | null;
};

export type ChampionDuplicate = {
  championId: string;
  firstLabel: string;
  secondLabel: string;
};

export function parseNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseKda(value: string): Kda | null {
  const trimmed = value.trim();
  const parts = trimmed.includes('/')
    ? trimmed.split('/')
    : trimmed.includes('-')
      ? trimmed.split('-')
      : trimmed.split(/\s+/);
  if (parts.length !== 3) return null;

  const [kills, deaths, assists] = parts.map(parseNonNegativeInteger);
  if (kills === null || deaths === null || assists === null) return null;

  return { kills, deaths, assists };
}

export function isStatsPristine(rows: StatRowDraft[]): boolean {
  return rows.every(
    (row) =>
      !row.championId &&
      row.kda.trim() === '' &&
      row.cs.trim() === '' &&
      row.damage.trim() === '' &&
      row.gold.trim() === '',
  );
}

function isStatComplete(row: StatRowDraft): boolean {
  return (
    !!row.championId &&
    parseKda(row.kda) !== null &&
    parseNonNegativeInteger(row.cs) !== null &&
    parseNonNegativeInteger(row.damage) !== null &&
    parseNonNegativeInteger(row.gold) !== null
  );
}

export function isStatsAllComplete(statsA: StatRowDraft[], statsB: StatRowDraft[]): boolean {
  return (
    statsA.length === 5 &&
    statsB.length === 5 &&
    statsA.every(isStatComplete) &&
    statsB.every(isStatComplete)
  );
}

export function derivePicksFromStats(
  statsA: StatRowDraft[],
  statsB: StatRowDraft[],
  teamAId: string,
  teamBId: string,
): PickDraft[] {
  return [
    ...statsA.flatMap((row) =>
      row.championId ? [{ teamId: teamAId, type: 'PICK' as const, championId: row.championId }] : [],
    ),
    ...statsB.flatMap((row) =>
      row.championId ? [{ teamId: teamBId, type: 'PICK' as const, championId: row.championId }] : [],
    ),
  ];
}

export function buildBansPayload({
  banRows,
  derivedPicks,
  legacyPicks,
  useDerivedPicks,
}: {
  banRows: BanRowDraft[];
  derivedPicks: PickDraft[];
  legacyPicks: PickDraft[];
  useDerivedPicks: boolean;
}): BanPickPayload[] {
  const picks = useDerivedPicks ? derivedPicks : legacyPicks;
  const rows = [
    ...banRows.map((row) => {
      if (!row.championId) throw new Error('BAN row missing champion');
      return {
        teamId: row.teamId,
        type: 'BAN' as const,
        championId: row.championId,
      };
    }),
    ...picks,
  ];

  return rows.map((row, index) => ({ ...row, order: index + 1 }));
}

export function findChampionDuplicate(
  rows: ChampionDuplicateInput[],
): ChampionDuplicate | null {
  const seen = new Map<string, string>();

  for (const row of rows) {
    if (!row.championId) continue;

    const firstLabel = seen.get(row.championId);
    if (firstLabel) {
      return {
        championId: row.championId,
        firstLabel,
        secondLabel: row.label,
      };
    }

    seen.set(row.championId, row.label);
  }

  return null;
}

export function buildStandardBanRows(blueTeamId: string, redTeamId: string): BanRowDraft[] {
  return Array.from({ length: 10 }, (_, index) => ({
    teamId: index % 2 === 0 ? blueTeamId : redTeamId,
    championId: null,
  }));
}
