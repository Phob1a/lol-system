export type LeaderboardStat = {
  registrationId: string; playerId: string; teamId: string; championId: string;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
};
export type LeaderboardGame = {
  isDraft: boolean;
  winnerTeamId: string | null;
  mvpRegistrationId: string | null;
  playerStats: LeaderboardStat[];
};
export type LeaderboardRow = {
  registrationId: string; playerId: string;
  games: number; wins: number;
  avgKills: number; avgDeaths: number; avgAssists: number; kda: number;
  avgCs: number; avgDamage: number; avgGold: number; mvpCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 仅计入：非草稿 + stats 恰好 10 条（双方各 5 = 完整）。表演赛照计；草稿/不完整排除。 */
export function computeLeaderboard(games: LeaderboardGame[]): LeaderboardRow[] {
  type Acc = { playerId: string; g: number; w: number; k: number; d: number; a: number; cs: number; dmg: number; gold: number; mvp: number };
  const acc = new Map<string, Acc>();
  for (const game of games) {
    if (game.isDraft) continue;
    if (game.playerStats.length !== 10) continue;
    for (const s of game.playerStats) {
      const cur = acc.get(s.registrationId) ?? { playerId: s.playerId, g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0, dmg: 0, gold: 0, mvp: 0 };
      cur.g++;
      if (game.winnerTeamId && s.teamId === game.winnerTeamId) cur.w++;
      cur.k += s.kills; cur.d += s.deaths; cur.a += s.assists;
      cur.cs += s.cs; cur.dmg += s.damage; cur.gold += s.gold;
      if (game.mvpRegistrationId === s.registrationId) cur.mvp++;
      acc.set(s.registrationId, cur);
    }
  }
  return [...acc.entries()].map(([registrationId, v]) => ({
    registrationId, playerId: v.playerId, games: v.g, wins: v.w,
    avgKills: round1(v.k / v.g), avgDeaths: round1(v.d / v.g), avgAssists: round1(v.a / v.g),
    kda: round2((v.k + v.a) / Math.max(1, v.d)),
    avgCs: round1(v.cs / v.g), avgDamage: round1(v.dmg / v.g), avgGold: round1(v.gold / v.g),
    mvpCount: v.mvp,
  }));
}
