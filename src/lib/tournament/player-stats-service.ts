import type { Db } from './types';
import { championName } from './champions';

export type PlayerGameRow = {
  gameId: string; matchId: string; matchLabel: string; opponent: string;
  championId: string; championName: string | null;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
  win: boolean; isMvp: boolean;
};
export type PlayerSeasonStats = {
  playerId: string; nickname: string;
  summary: { games: number; wins: number; avgKills: number; avgDeaths: number; avgAssists: number; kda: number; avgCs: number; avgDamage: number; avgGold: number; mvpCount: number };
  games: PlayerGameRow[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 指定赛季内该选手的统计；签名按 seasonId 参数化（跨赛季汇总为后续扩展，零表改动）。 */
export async function getPlayerSeasonStats(db: Db, playerId: string, seasonId: string): Promise<PlayerSeasonStats | null> {
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) return null;
  const reg = await db.registration.findFirst({ where: { playerId, seasonId } }); // @@unique([seasonId, playerId])
  const empty: PlayerSeasonStats = {
    playerId, nickname: player.nickname,
    summary: { games: 0, wins: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0, kda: 0, avgCs: 0, avgDamage: 0, avgGold: 0, mvpCount: 0 },
    games: [],
  };
  if (!reg) return empty;

  const stats = await db.gamePlayerStat.findMany({
    where: { registrationId: reg.id, game: { isDraft: false, match: { tournament: { seasonId } } } },
    include: {
      game: { include: { match: { include: { teamA: { select: { id: true, name: true } }, teamB: { select: { id: true, name: true } } } } } },
    },
    orderBy: { game: { match: { scheduledAt: 'asc' } } },
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
  if (n === 0) return { playerId, nickname: reg.nickname, summary: empty.summary, games: [] };
  const sum = rows.reduce(
    (acc, r) => ({ k: acc.k + r.kills, d: acc.d + r.deaths, a: acc.a + r.assists, cs: acc.cs + r.cs, dmg: acc.dmg + r.damage, gold: acc.gold + r.gold, w: acc.w + (r.win ? 1 : 0), mvp: acc.mvp + (r.isMvp ? 1 : 0) }),
    { k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, w: 0, mvp: 0 },
  );
  return {
    playerId, nickname: reg.nickname,
    summary: {
      games: n, wins: sum.w,
      avgKills: round1(sum.k / n), avgDeaths: round1(sum.d / n), avgAssists: round1(sum.a / n),
      kda: round2((sum.k + sum.a) / Math.max(1, sum.d)),
      avgCs: round1(sum.cs / n), avgDamage: round1(sum.dmg / n), avgGold: round1(sum.gold / n),
      mvpCount: sum.mvp,
    },
    games: rows,
  };
}
