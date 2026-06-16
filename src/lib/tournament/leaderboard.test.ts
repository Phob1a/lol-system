import { expect, it } from 'vitest';
import { computeLeaderboard, type LeaderboardGame, type LeaderboardStat } from './leaderboard';

function stat(registrationId: string, playerId: string, over: Partial<LeaderboardStat> = {}): LeaderboardStat {
  return { registrationId, playerId, teamId: 'TA', championId: 'Ahri', kills: 2, deaths: 1, assists: 4, cs: 200, damage: 20000, gold: 12000, ...over };
}
function game(over: Partial<LeaderboardGame> = {}): LeaderboardGame {
  return {
    isDraft: false, winnerTeamId: 'TA', mvpRegistrationId: null,
    playerStats: Array.from({ length: 10 }, (_, i) => stat(`r${i}`, `p${i}`, { teamId: i < 5 ? 'TA' : 'TB' })),
    ...over,
  };
}

it('空输入 → 空榜', () => {
  expect(computeLeaderboard([])).toEqual([]);
});

it('单局聚合：每人一行、场均 1 位小数、kda 2 位', () => {
  const rows = computeLeaderboard([game()]);
  expect(rows).toHaveLength(10);
  const r0 = rows.find((r) => r.registrationId === 'r0')!;
  expect(r0.playerId).toBe('p0');
  expect(r0.games).toBe(1);
  expect(r0.avgKills).toBe(2);
  expect(r0.kda).toBe(6); // (2+4)/max(1,1)
});

it('草稿局与不完整局被排除', () => {
  const draft = game({ isDraft: true });
  const incomplete = game({ playerStats: game().playerStats.slice(0, 9) });
  expect(computeLeaderboard([draft, incomplete])).toEqual([]);
});

it('wins 与 mvpCount 计数', () => {
  const g1 = game({ winnerTeamId: 'TA', mvpRegistrationId: 'r0' });
  const g2 = game({ winnerTeamId: 'TB', mvpRegistrationId: 'r0' });
  const r0 = computeLeaderboard([g1, g2]).find((r) => r.registrationId === 'r0')!;
  expect(r0.games).toBe(2);
  expect(r0.wins).toBe(1);
  expect(r0.mvpCount).toBe(2);
});

it('kda 防除零：deaths=0 用 max(1,D)', () => {
  const g = game({ playerStats: [stat('r0', 'p0', { teamId: 'TA', kills: 3, deaths: 0, assists: 1 }), ...game().playerStats.slice(1)] });
  const r0 = computeLeaderboard([g]).find((r) => r.registrationId === 'r0')!;
  expect(r0.kda).toBe(4);
});

it('场均四舍五入到 1 位小数', () => {
  const mk = (k: number) => game({ playerStats: [stat('r0', 'p0', { teamId: 'TA', kills: k }), ...game().playerStats.slice(1)] });
  const r0 = computeLeaderboard([mk(1), mk(2), mk(2)]).find((r) => r.registrationId === 'r0')!;
  expect(r0.avgKills).toBe(1.7); // 5/3
});
