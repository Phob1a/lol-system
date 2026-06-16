import type { Db } from './types';
import { championName } from './champions';

export type PlayerGameRow = {
  gameId: string; matchId: string; matchLabel: string; opponent: string;
  championId: string; championName: string | null;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
  win: boolean; isMvp: boolean;
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
export type PlayerTournamentStats = {
  registrationId: string | null;
  playerId: string; nickname: string;
  teamName: string | null;
  primaryPosition: string | null;
  summary: { games: number; wins: number; winRate: number; avgKills: number; avgDeaths: number; avgAssists: number; kda: number; avgCs: number; avgDamage: number; avgGold: number; mvpCount: number };
  recentForm: boolean[];
  commonChampions: PlayerChampionSummary[];
  games: PlayerGameRow[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 指定赛事内该选手的统计；签名按 tournamentId 参数化（跨赛事汇总为后续扩展，零表改动）。 */
export async function getPlayerTournamentStats(db: Db, playerId: string, tournamentId: string): Promise<PlayerTournamentStats | null> {
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

  const rows: PlayerGameRow[] = stats.map((s) => {
    const m = s.game.match;
    const opp = m.teamA?.id === s.teamId ? m.teamB : m.teamA;
    return {
      gameId: s.gameId, matchId: m.id, matchLabel: m.label ?? m.roundKey ?? '比赛',
      opponent: opp?.name ?? '—',
      championId: s.championId, championName: championName(s.championId),
      kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
      win: s.game.winnerTeamId === s.teamId,
      isMvp: s.game.mvpRegistrationId === reg.id,
    };
  });

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
