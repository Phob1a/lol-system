import type { Prisma } from '@prisma/client';
import type { Db } from './types';
import { championName } from './champions';

type JsonObject = Record<string, unknown>;

export type DamageComposition = {
  physical: number;
  magic: number;
  trueDamage: number;
  total: number;
  physicalPct: number;
  magicPct: number;
  truePct: number;
};

export type PlayerGameExtended = {
  sourceAvailable: boolean;
  championLevel: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  goldSpent: number | null;
  teamJungleCs: number | null;
  enemyJungleCs: number | null;
  visionScore: number | null;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWardsBought: number | null;
  damageTaken: number | null;
  damageMitigated: number | null;
  objectiveDamage: number | null;
  turretDamage: number | null;
  healing: number | null;
  ccTime: number | null;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  firstTowerKill: boolean;
  firstTowerAssist: boolean;
  firstInhibitorKill: boolean;
  firstInhibitorAssist: boolean;
  turretKills: number;
  inhibitorKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestMultiKill: number | null;
  largestKillingSpree: number | null;
  items: number[];
  damageComposition: DamageComposition | null;
  rawStats?: JsonObject | null;
};

export type PlayerGameRow = {
  gameId: string; matchId: string; matchLabel: string; opponent: string;
  championId: string; championName: string | null;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
  win: boolean; isMvp: boolean;
  extended: PlayerGameExtended | null;
};
export type PlayerChampionSummary = {
  championId: string;
  championName: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  avgDamage: number;
};

export type PlayerExtendedAverages = {
  avgGoldSpent: number | null;
  avgTeamJungleCs: number | null;
  avgEnemyJungleCs: number | null;
  avgObjectiveDamage: number | null;
  avgTurretDamage: number | null;
  avgDamageTaken: number | null;
  avgDamageMitigated: number | null;
  avgVisionScore: number | null;
  avgWardsPlaced: number | null;
  avgWardsKilled: number | null;
  avgControlWardsBought: number | null;
  avgHealing: number | null;
  avgCcTime: number | null;
};

export type PlayerExtendedTotals = {
  firstBloodKills: number;
  firstBloodAssists: number;
  firstTowerKills: number;
  firstTowerAssists: number;
  firstInhibitorKills: number;
  firstInhibitorAssists: number;
  turretKills: number;
  inhibitorKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestMultiKill: number | null;
  largestKillingSpree: number | null;
  longestTimeSpentLiving: number | null;
};

export type PlayerRadarScores = {
  sourceGames: number;
  comparisonPlayers: number;
  sampleSizeWarning: boolean;
  output: number | null;
  economy: number | null;
  vision: number | null;
  survival: number | null;
  objective: number | null;
  teamfight: number | null;
};

export type PlayerTrendPoint = {
  gameId: string;
  matchLabel: string;
  damage: number | null;
  visionScore: number | null;
  damagePercentile: number | null;
  visionPercentile: number | null;
};

export type PlayerExtendedSummary = {
  sourceGames: number;
  totalGames: number;
  averages: PlayerExtendedAverages;
  totals: PlayerExtendedTotals;
  radar: PlayerRadarScores;
  trends: PlayerTrendPoint[];
};

export type PlayerTournamentStats = {
  registrationId: string | null;
  playerId: string; nickname: string;
  teamName: string | null;
  primaryPosition: string | null;
  summary: { games: number; wins: number; winRate: number; avgKills: number; avgDeaths: number; avgAssists: number; kda: number; avgCs: number; avgDamage: number; avgGold: number; mvpCount: number };
  extended: PlayerExtendedSummary;
  recentForm: boolean[];
  commonChampions: PlayerChampionSummary[];
  games: PlayerGameRow[];
};

export type PlayerStatsOptions = {
  includeRawStats?: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

type StatRecord = {
  registrationId: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  gold: number;
  extStats: Prisma.JsonValue | null;
};

type NormalizedExtStats = {
  raw: JsonObject;
  championLevel: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  goldEarned: number | null;
  goldSpent: number | null;
  totalMinionsKilled: number | null;
  neutralMinionsKilled: number | null;
  teamJungleCs: number | null;
  enemyJungleCs: number | null;
  totalDamageDealtToChampions: number | null;
  physicalDamageDealtToChampions: number | null;
  magicDamageDealtToChampions: number | null;
  trueDamageDealtToChampions: number | null;
  objectiveDamage: number | null;
  turretDamage: number | null;
  damageTaken: number | null;
  damageMitigated: number | null;
  longestTimeSpentLiving: number | null;
  visionScore: number | null;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWardsBought: number | null;
  healing: number | null;
  ccTime: number | null;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  firstTowerKill: boolean;
  firstTowerAssist: boolean;
  firstInhibitorKill: boolean;
  firstInhibitorAssist: boolean;
  turretKills: number;
  inhibitorKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestMultiKill: number | null;
  largestKillingSpree: number | null;
  items: number[];
};

const emptyAverages = (): PlayerExtendedAverages => ({
  avgGoldSpent: null,
  avgTeamJungleCs: null,
  avgEnemyJungleCs: null,
  avgObjectiveDamage: null,
  avgTurretDamage: null,
  avgDamageTaken: null,
  avgDamageMitigated: null,
  avgVisionScore: null,
  avgWardsPlaced: null,
  avgWardsKilled: null,
  avgControlWardsBought: null,
  avgHealing: null,
  avgCcTime: null,
});

const emptyTotals = (): PlayerExtendedTotals => ({
  firstBloodKills: 0,
  firstBloodAssists: 0,
  firstTowerKills: 0,
  firstTowerAssists: 0,
  firstInhibitorKills: 0,
  firstInhibitorAssists: 0,
  turretKills: 0,
  inhibitorKills: 0,
  doubleKills: 0,
  tripleKills: 0,
  quadraKills: 0,
  pentaKills: 0,
  largestMultiKill: null,
  largestKillingSpree: null,
  longestTimeSpentLiving: null,
});

const emptyRadar = (sourceGames = 0, comparisonPlayers = 0): PlayerRadarScores => ({
  sourceGames,
  comparisonPlayers,
  sampleSizeWarning: sourceGames < 3 || comparisonPlayers < 4,
  output: null,
  economy: null,
  vision: null,
  survival: null,
  objective: null,
  teamfight: null,
});

function asJsonObject(value: Prisma.JsonValue | null): JsonObject | null {
  return !!value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function numberField(row: JsonObject, key: string): number | null {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolField(row: JsonObject, key: string): boolean {
  return row[key] === true || row[key] === 1;
}

function countField(row: JsonObject, key: string): number {
  return numberField(row, key) ?? 0;
}

function normalizeExtStats(extStats: Prisma.JsonValue | null): NormalizedExtStats | null {
  const raw = asJsonObject(extStats);
  if (!raw) return null;
  const items = Array.from({ length: 7 }, (_, idx) => numberField(raw, `item${idx}`))
    .filter((item): item is number => item !== null && item > 0);
  return {
    raw,
    championLevel: numberField(raw, 'champLevel'),
    spell1Id: numberField(raw, 'spell1Id'),
    spell2Id: numberField(raw, 'spell2Id'),
    goldEarned: numberField(raw, 'goldEarned'),
    goldSpent: numberField(raw, 'goldSpent'),
    totalMinionsKilled: numberField(raw, 'totalMinionsKilled'),
    neutralMinionsKilled: numberField(raw, 'neutralMinionsKilled'),
    teamJungleCs: numberField(raw, 'neutralMinionsKilledTeamJungle'),
    enemyJungleCs: numberField(raw, 'neutralMinionsKilledEnemyJungle'),
    totalDamageDealtToChampions: numberField(raw, 'totalDamageDealtToChampions'),
    physicalDamageDealtToChampions: numberField(raw, 'physicalDamageDealtToChampions'),
    magicDamageDealtToChampions: numberField(raw, 'magicDamageDealtToChampions'),
    trueDamageDealtToChampions: numberField(raw, 'trueDamageDealtToChampions'),
    objectiveDamage: numberField(raw, 'damageDealtToObjectives'),
    turretDamage: numberField(raw, 'damageDealtToTurrets'),
    damageTaken: numberField(raw, 'totalDamageTaken'),
    damageMitigated: numberField(raw, 'damageSelfMitigated'),
    longestTimeSpentLiving: numberField(raw, 'longestTimeSpentLiving'),
    visionScore: numberField(raw, 'visionScore'),
    wardsPlaced: numberField(raw, 'wardsPlaced'),
    wardsKilled: numberField(raw, 'wardsKilled'),
    controlWardsBought: numberField(raw, 'visionWardsBoughtInGame'),
    healing: numberField(raw, 'totalHeal'),
    ccTime: numberField(raw, 'timeCCingOthers') ?? numberField(raw, 'totalTimeCrowdControlDealt'),
    firstBloodKill: boolField(raw, 'firstBloodKill'),
    firstBloodAssist: boolField(raw, 'firstBloodAssist'),
    firstTowerKill: boolField(raw, 'firstTowerKill'),
    firstTowerAssist: boolField(raw, 'firstTowerAssist'),
    firstInhibitorKill: boolField(raw, 'firstInhibitorKill'),
    firstInhibitorAssist: boolField(raw, 'firstInhibitorAssist'),
    turretKills: countField(raw, 'turretKills'),
    inhibitorKills: countField(raw, 'inhibitorKills'),
    doubleKills: countField(raw, 'doubleKills'),
    tripleKills: countField(raw, 'tripleKills'),
    quadraKills: countField(raw, 'quadraKills'),
    pentaKills: countField(raw, 'pentaKills'),
    largestMultiKill: numberField(raw, 'largestMultiKill'),
    largestKillingSpree: numberField(raw, 'largestKillingSpree'),
    items,
  };
}

function avg(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return round1(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function maxNullable(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length === 0 ? null : Math.max(...valid);
}

function damageComposition(n: NormalizedExtStats): DamageComposition | null {
  const physical = n.physicalDamageDealtToChampions ?? 0;
  const magic = n.magicDamageDealtToChampions ?? 0;
  const trueDamage = n.trueDamageDealtToChampions ?? 0;
  const total = physical + magic + trueDamage;
  if (total <= 0) return null;
  return {
    physical,
    magic,
    trueDamage,
    total,
    physicalPct: round1((physical / total) * 100),
    magicPct: round1((magic / total) * 100),
    truePct: round1((trueDamage / total) * 100),
  };
}

function toGameExtended(n: NormalizedExtStats | null, includeRawStats: boolean): PlayerGameExtended | null {
  if (!n) return null;
  return {
    sourceAvailable: true,
    championLevel: n.championLevel,
    spell1Id: n.spell1Id,
    spell2Id: n.spell2Id,
    goldSpent: n.goldSpent,
    teamJungleCs: n.teamJungleCs,
    enemyJungleCs: n.enemyJungleCs,
    visionScore: n.visionScore,
    wardsPlaced: n.wardsPlaced,
    wardsKilled: n.wardsKilled,
    controlWardsBought: n.controlWardsBought,
    damageTaken: n.damageTaken,
    damageMitigated: n.damageMitigated,
    objectiveDamage: n.objectiveDamage,
    turretDamage: n.turretDamage,
    healing: n.healing,
    ccTime: n.ccTime,
    firstBloodKill: n.firstBloodKill,
    firstBloodAssist: n.firstBloodAssist,
    firstTowerKill: n.firstTowerKill,
    firstTowerAssist: n.firstTowerAssist,
    firstInhibitorKill: n.firstInhibitorKill,
    firstInhibitorAssist: n.firstInhibitorAssist,
    turretKills: n.turretKills,
    inhibitorKills: n.inhibitorKills,
    doubleKills: n.doubleKills,
    tripleKills: n.tripleKills,
    quadraKills: n.quadraKills,
    pentaKills: n.pentaKills,
    largestMultiKill: n.largestMultiKill,
    largestKillingSpree: n.largestKillingSpree,
    items: n.items,
    damageComposition: damageComposition(n),
    ...(includeRawStats ? { rawStats: n.raw } : {}),
  };
}

function percentile(value: number | null, values: number[]): number | null {
  if (value === null || values.length === 0) return null;
  if (values.length === 1) return 100;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((candidate) => candidate < value).length;
  const equal = sorted.filter((candidate) => candidate === value).length;
  return round1(((below + (equal - 1) / 2) / (sorted.length - 1)) * 100);
}

function avgNumber(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compactNumbers(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null);
}

type RadarRaw = Omit<PlayerRadarScores, 'sourceGames' | 'comparisonPlayers' | 'sampleSizeWarning'>;

function rawRadarForStats(stats: StatRecord[]): { sourceGames: number; raw: RadarRaw } {
  const normalized = stats.map((stat) => ({ stat, ext: normalizeExtStats(stat.extStats) })).filter((row) => row.ext);
  const sourceGames = normalized.length;
  const output = avgNumber(compactNumbers(normalized.map((row) => row.ext!.totalDamageDealtToChampions)));
  const economy = avgNumber(compactNumbers(normalized.map((row) => {
    const farm = (row.ext!.totalMinionsKilled ?? 0) + (row.ext!.neutralMinionsKilled ?? 0);
    const gold = row.ext!.goldEarned ?? row.stat.gold;
    return gold + farm * 25;
  })));
  const vision = avgNumber(compactNumbers(normalized.map((row) => row.ext!.visionScore)));
  const survival = avgNumber(normalized.map((row) => {
    const mitigated = row.ext!.damageMitigated ?? 0;
    const taken = row.ext!.damageTaken ?? 0;
    return mitigated + taken * 0.2 - row.stat.deaths * 1500;
  }));
  const objective = avgNumber(compactNumbers(normalized.map((row) => {
    const objectiveDamage = row.ext!.objectiveDamage ?? 0;
    const turretKills = row.ext!.turretKills;
    const inhibitorKills = row.ext!.inhibitorKills;
    return objectiveDamage + turretKills * 1200 + inhibitorKills * 1800;
  })));
  const teamfight = avgNumber(normalized.map((row) => {
    const kda = row.stat.kills + row.stat.assists - row.stat.deaths;
    const cc = row.ext!.ccTime ?? 0;
    const multikill = row.ext!.doubleKills + row.ext!.tripleKills * 2 + row.ext!.quadraKills * 3 + row.ext!.pentaKills * 4;
    return kda * 1000 + cc * 80 + multikill * 1500;
  }));
  return { sourceGames, raw: { output, economy, vision, survival, objective, teamfight } };
}

function computeRadarForRegistration(allStats: StatRecord[], registrationId: string): PlayerRadarScores {
  const byRegistration = new Map<string, StatRecord[]>();
  for (const stat of allStats) {
    const rows = byRegistration.get(stat.registrationId) ?? [];
    rows.push(stat);
    byRegistration.set(stat.registrationId, rows);
  }
  const raws = [...byRegistration.entries()].map(([regId, rows]) => ({ regId, ...rawRadarForStats(rows) }));
  const comparable = raws.filter((row) => row.sourceGames > 0);
  const current = raws.find((row) => row.regId === registrationId);
  if (!current || current.sourceGames === 0) return emptyRadar(0, comparable.length);
  const scoreFor = (key: keyof RadarRaw) => percentile(
    current.raw[key],
    compactNumbers(comparable.map((row) => row.raw[key])),
  );
  return {
    sourceGames: current.sourceGames,
    comparisonPlayers: comparable.length,
    sampleSizeWarning: current.sourceGames < 3 || comparable.length < 4,
    output: scoreFor('output'),
    economy: scoreFor('economy'),
    vision: scoreFor('vision'),
    survival: scoreFor('survival'),
    objective: scoreFor('objective'),
    teamfight: scoreFor('teamfight'),
  };
}

function computeExtendedSummary(
  rows: PlayerGameRow[],
  normalized: Array<NormalizedExtStats | null>,
  allStats: StatRecord[],
  registrationId: string | null,
): PlayerExtendedSummary {
  const source = normalized.filter((n): n is NormalizedExtStats => n !== null);
  const sourceGames = source.length;
  const averages = sourceGames === 0 ? emptyAverages() : {
    avgGoldSpent: avg(source.map((n) => n.goldSpent)),
    avgTeamJungleCs: avg(source.map((n) => n.teamJungleCs)),
    avgEnemyJungleCs: avg(source.map((n) => n.enemyJungleCs)),
    avgObjectiveDamage: avg(source.map((n) => n.objectiveDamage)),
    avgTurretDamage: avg(source.map((n) => n.turretDamage)),
    avgDamageTaken: avg(source.map((n) => n.damageTaken)),
    avgDamageMitigated: avg(source.map((n) => n.damageMitigated)),
    avgVisionScore: avg(source.map((n) => n.visionScore)),
    avgWardsPlaced: avg(source.map((n) => n.wardsPlaced)),
    avgWardsKilled: avg(source.map((n) => n.wardsKilled)),
    avgControlWardsBought: avg(source.map((n) => n.controlWardsBought)),
    avgHealing: avg(source.map((n) => n.healing)),
    avgCcTime: avg(source.map((n) => n.ccTime)),
  };
  const totals = sourceGames === 0 ? emptyTotals() : {
    firstBloodKills: source.filter((n) => n.firstBloodKill).length,
    firstBloodAssists: source.filter((n) => n.firstBloodAssist).length,
    firstTowerKills: source.filter((n) => n.firstTowerKill).length,
    firstTowerAssists: source.filter((n) => n.firstTowerAssist).length,
    firstInhibitorKills: source.filter((n) => n.firstInhibitorKill).length,
    firstInhibitorAssists: source.filter((n) => n.firstInhibitorAssist).length,
    turretKills: source.reduce((sum, n) => sum + n.turretKills, 0),
    inhibitorKills: source.reduce((sum, n) => sum + n.inhibitorKills, 0),
    doubleKills: source.reduce((sum, n) => sum + n.doubleKills, 0),
    tripleKills: source.reduce((sum, n) => sum + n.tripleKills, 0),
    quadraKills: source.reduce((sum, n) => sum + n.quadraKills, 0),
    pentaKills: source.reduce((sum, n) => sum + n.pentaKills, 0),
    largestMultiKill: maxNullable(source.map((n) => n.largestMultiKill)),
    largestKillingSpree: maxNullable(source.map((n) => n.largestKillingSpree)),
    longestTimeSpentLiving: maxNullable(source.map((n) => n.longestTimeSpentLiving)),
  };
  const allNormalized = allStats.map((stat) => normalizeExtStats(stat.extStats));
  const allDamage = compactNumbers(allNormalized.map((n, idx) => n?.totalDamageDealtToChampions ?? allStats[idx].damage));
  const allVision = compactNumbers(allNormalized.map((n) => n?.visionScore ?? null));
  const trends = rows.map((row, idx) => {
    const n = normalized[idx];
    const damage = n?.totalDamageDealtToChampions ?? row.damage;
    const visionScore = n?.visionScore ?? null;
    return {
      gameId: row.gameId,
      matchLabel: row.matchLabel,
      damage,
      visionScore,
      damagePercentile: percentile(damage, allDamage),
      visionPercentile: percentile(visionScore, allVision),
    };
  });
  return {
    sourceGames,
    totalGames: rows.length,
    averages,
    totals,
    radar: registrationId ? computeRadarForRegistration(allStats, registrationId) : emptyRadar(sourceGames, 0),
    trends,
  };
}

/** 指定赛事内该选手的统计；签名按 tournamentId 参数化（跨赛事汇总为后续扩展，零表改动）。 */
export async function getPlayerTournamentStats(db: Db, playerId: string, tournamentId: string, options: PlayerStatsOptions = {}): Promise<PlayerTournamentStats | null> {
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) return null;
  const reg = await db.registration.findFirst({ where: { playerId, tournamentId } }); // @@unique([tournamentId, playerId])
  const roster = reg
    ? await db.tournamentTeamPlayer.findFirst({
        where: { registrationId: reg.id, tournamentTeam: { tournamentId } },
        include: { tournamentTeam: { include: { team: { select: { name: true } } } } },
      })
    : null;
  const empty: PlayerTournamentStats = {
    registrationId: reg?.id ?? null,
    playerId,
    nickname: reg?.nickname ?? player.nickname,
    teamName: roster?.tournamentTeam.team.name ?? null,
    primaryPosition: reg?.primaryPositions[0] ?? null,
    summary: { games: 0, wins: 0, winRate: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0, kda: 0, avgCs: 0, avgDamage: 0, avgGold: 0, mvpCount: 0 },
    extended: { sourceGames: 0, totalGames: 0, averages: emptyAverages(), totals: emptyTotals(), radar: emptyRadar(), trends: [] },
    recentForm: [],
    commonChampions: [],
    games: [],
  };
  if (!reg) return empty;

  const stats = await db.gamePlayerStat.findMany({
    where: { registrationId: reg.id, game: { isDraft: false, match: { tournamentId } } },
    include: {
      game: { include: { match: { include: { teamA: { select: { id: true, name: true } }, teamB: { select: { id: true, name: true } } } } } },
    },
    orderBy: [{ game: { match: { scheduledAt: 'desc' } } }, { game: { index: 'desc' } }],
  });
  const allStats = await db.gamePlayerStat.findMany({
    where: { game: { isDraft: false, match: { tournamentId } } },
    select: {
      registrationId: true,
      kills: true,
      deaths: true,
      assists: true,
      cs: true,
      damage: true,
      gold: true,
      extStats: true,
    },
  });

  const rows: PlayerGameRow[] = stats.map((s) => {
    const m = s.game.match;
    const opp = m.teamA?.id === s.teamId ? m.teamB : m.teamA;
    const ext = normalizeExtStats(s.extStats);
    return {
      gameId: s.gameId, matchId: m.id, matchLabel: m.label ?? m.roundKey ?? '比赛',
      opponent: opp?.name ?? '—',
      championId: s.championId, championName: championName(s.championId),
      kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
      win: s.game.winnerTeamId === s.teamId,
      isMvp: s.game.mvpRegistrationId === reg.id,
      extended: toGameExtended(ext, options.includeRawStats === true),
    };
  });
  const normalized = stats.map((s) => normalizeExtStats(s.extStats));

  const n = rows.length;
  if (n === 0) return empty;
  const sum = rows.reduce(
    (acc, r) => ({ k: acc.k + r.kills, d: acc.d + r.deaths, a: acc.a + r.assists, cs: acc.cs + r.cs, dmg: acc.dmg + r.damage, gold: acc.gold + r.gold, w: acc.w + (r.win ? 1 : 0), mvp: acc.mvp + (r.isMvp ? 1 : 0) }),
    { k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, w: 0, mvp: 0 },
  );
  const commonChampions = computeCommonChampions(rows);
  return {
    registrationId: reg.id,
    playerId,
    nickname: reg.nickname,
    teamName: roster?.tournamentTeam.team.name ?? null,
    primaryPosition: reg.primaryPositions[0] ?? null,
    summary: {
      games: n, wins: sum.w,
      winRate: round1((sum.w / n) * 100),
      avgKills: round1(sum.k / n), avgDeaths: round1(sum.d / n), avgAssists: round1(sum.a / n),
      kda: round2((sum.k + sum.a) / Math.max(1, sum.d)),
      avgCs: round1(sum.cs / n), avgDamage: round1(sum.dmg / n), avgGold: round1(sum.gold / n),
      mvpCount: sum.mvp,
    },
    extended: computeExtendedSummary(rows, normalized, allStats, reg.id),
    recentForm: rows.slice(0, 8).map((row) => row.win),
    commonChampions,
    games: rows,
  };
}

function computeCommonChampions(rows: PlayerGameRow[]): PlayerChampionSummary[] {
  type Acc = {
    championName: string | null;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
  };
  const acc = new Map<string, Acc>();
  for (const row of rows) {
    const cur = acc.get(row.championId) ?? {
      championName: row.championName,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
    };
    cur.games++;
    if (row.win) cur.wins++;
    cur.kills += row.kills;
    cur.deaths += row.deaths;
    cur.assists += row.assists;
    cur.damage += row.damage;
    acc.set(row.championId, cur);
  }

  return [...acc.entries()]
    .map(([championId, v]) => ({
      championId,
      championName: v.championName,
      games: v.games,
      wins: v.wins,
      winRate: round1((v.wins / v.games) * 100),
      kda: round2((v.kills + v.assists) / Math.max(1, v.deaths)),
      avgDamage: round1(v.damage / v.games),
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kda - a.kda);
}

export async function listPlayerTournamentProfiles(db: Db, tournamentId: string): Promise<PlayerTournamentStats[]> {
  const registrations = await db.registration.findMany({
    where: { tournamentId, status: 'ACTIVE' },
    select: { playerId: true },
    orderBy: { registeredAt: 'asc' },
  });

  const profiles = await Promise.all(
    registrations.map((registration) => getPlayerTournamentStats(db, registration.playerId, tournamentId)),
  );

  return profiles
    .filter((profile): profile is PlayerTournamentStats => profile !== null)
    .sort((a, b) => {
      if (b.summary.games !== a.summary.games) {
        const aHasGames = a.summary.games > 0 ? 1 : 0;
        const bHasGames = b.summary.games > 0 ? 1 : 0;
        if (bHasGames !== aHasGames) return bHasGames - aHasGames;
      }
      return (
        b.summary.kda - a.summary.kda ||
        b.summary.winRate - a.summary.winRate ||
        b.summary.avgDamage - a.summary.avgDamage ||
        a.nickname.localeCompare(b.nickname)
      );
    });
}
