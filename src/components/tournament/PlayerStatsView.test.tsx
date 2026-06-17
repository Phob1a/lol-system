import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerStatsView, type PlayerTournamentStats } from './PlayerStatsView';

function stats(overrides: Partial<PlayerTournamentStats> = {}): PlayerTournamentStats {
  const base: PlayerTournamentStats = {
    registrationId: 'reg-night',
    playerId: 'player-night',
    nickname: '夜阑惊梦',
    teamName: '红方',
    primaryPosition: 'JUNGLE',
    summary: {
      games: 3,
      wins: 2,
      winRate: 66.7,
      avgKills: 5.7,
      avgDeaths: 3.3,
      avgAssists: 8,
      kda: 4.15,
      avgCs: 188,
      avgDamage: 21400,
      avgGold: 12900,
      mvpCount: 1,
    },
    extended: {
      sourceGames: 3,
      totalGames: 3,
      averages: {
        avgGoldSpent: 11800,
        avgTeamJungleCs: 42,
        avgEnemyJungleCs: 8,
        avgObjectiveDamage: 10800,
        avgTurretDamage: 2300,
        avgDamageTaken: 28100,
        avgDamageMitigated: 18600,
        avgVisionScore: 34.7,
        avgWardsPlaced: 9.3,
        avgWardsKilled: 2,
        avgControlWardsBought: 3,
        avgHealing: 4200,
        avgCcTime: 21.4,
      },
      totals: {
        firstBloodKills: 1,
        firstBloodAssists: 1,
        firstTowerKills: 0,
        firstTowerAssists: 1,
        firstInhibitorKills: 0,
        firstInhibitorAssists: 0,
        turretKills: 5,
        inhibitorKills: 1,
        doubleKills: 1,
        tripleKills: 1,
        quadraKills: 0,
        pentaKills: 0,
        largestMultiKill: 3,
        largestKillingSpree: 6,
        longestTimeSpentLiving: 482,
      },
      radar: {
        sourceGames: 3,
        comparisonPlayers: 10,
        sampleSizeWarning: false,
        output: 84,
        economy: 80,
        vision: 62,
        survival: 70,
        objective: 64,
        teamfight: 76,
      },
      trends: [
        { gameId: 'game-1', matchLabel: '半决赛 G1', damage: 30423, visionScore: 30, damagePercentile: 88, visionPercentile: 45 },
        { gameId: 'game-2', matchLabel: '小组赛 R4', damage: 14043, visionScore: 34, damagePercentile: 38, visionPercentile: 56 },
        { gameId: 'game-3', matchLabel: '小组赛 R3', damage: 19800, visionScore: 40, damagePercentile: 62, visionPercentile: 86 },
      ],
    },
    recentForm: [true, false, true],
    commonChampions: [],
    games: [
      {
        gameId: 'game-1',
        matchId: 'match-1',
        matchLabel: '半决赛 G1',
        opponent: '蓝方',
        championId: 'Smolder',
        championName: '斯莫德',
        kills: 8,
        deaths: 3,
        assists: 9,
        cs: 210,
        damage: 30423,
        gold: 12436,
        win: true,
        isMvp: false,
        extended: {
          sourceAvailable: true,
          championLevel: 16,
          spell1Id: 14,
          spell2Id: 4,
          goldSpent: 11900,
          teamJungleCs: 42,
          enemyJungleCs: 8,
          visionScore: 30,
          wardsPlaced: 8,
          wardsKilled: 2,
          controlWardsBought: 2,
          damageTaken: 31540,
          damageMitigated: 18600,
          objectiveDamage: 11240,
          turretDamage: 2310,
          healing: 4200,
          ccTime: 21,
          firstBloodKill: true,
          firstBloodAssist: false,
          firstTowerKill: false,
          firstTowerAssist: true,
          firstInhibitorKill: false,
          firstInhibitorAssist: false,
          turretKills: 2,
          inhibitorKills: 0,
          doubleKills: 1,
          tripleKills: 0,
          quadraKills: 0,
          pentaKills: 0,
          largestMultiKill: 2,
          largestKillingSpree: 6,
          items: [3078, 3158],
          damageComposition: {
            physical: 21840,
            magic: 6420,
            trueDamage: 2163,
            total: 30423,
            physicalPct: 71.8,
            magicPct: 21.1,
            truePct: 7.1,
          },
          rawStats: {
            unknownFutureKey: 12345,
            totalDamageDealtToChampions: 30423,
          },
        },
      },
      {
        gameId: 'game-2',
        matchId: 'match-2',
        matchLabel: '小组赛 R4',
        opponent: '蓝方',
        championId: 'Viego',
        championName: '佛耶戈',
        kills: 3,
        deaths: 3,
        assists: 9,
        cs: 190,
        damage: 14043,
        gold: 11200,
        win: false,
        isMvp: false,
        extended: {
          sourceAvailable: true,
          championLevel: 14,
          spell1Id: 4,
          spell2Id: 11,
          goldSpent: 10800,
          teamJungleCs: 40,
          enemyJungleCs: 6,
          visionScore: 34,
          wardsPlaced: 11,
          wardsKilled: 2,
          controlWardsBought: 3,
          damageTaken: 26420,
          damageMitigated: 12000,
          objectiveDamage: 7980,
          turretDamage: 1200,
          healing: 3600,
          ccTime: 18,
          firstBloodKill: false,
          firstBloodAssist: true,
          firstTowerKill: false,
          firstTowerAssist: false,
          firstInhibitorKill: false,
          firstInhibitorAssist: false,
          turretKills: 1,
          inhibitorKills: 0,
          doubleKills: 0,
          tripleKills: 1,
          quadraKills: 0,
          pentaKills: 0,
          largestMultiKill: 3,
          largestKillingSpree: 4,
          items: [],
          damageComposition: {
            physical: 6500,
            magic: 5440,
            trueDamage: 2103,
            total: 14043,
            physicalPct: 46.3,
            magicPct: 38.7,
            truePct: 15,
          },
          rawStats: null,
        },
      },
      {
        gameId: 'game-3',
        matchId: 'match-3',
        matchLabel: '小组赛 R3',
        opponent: '蓝方',
        championId: 'Azir',
        championName: '阿兹尔',
        kills: 6,
        deaths: 4,
        assists: 6,
        cs: 196,
        damage: 19800,
        gold: 13660,
        win: true,
        isMvp: true,
        extended: null,
      },
    ],
    ...overrides,
  };
  return base;
}

describe('PlayerStatsView extended profile', () => {
  it('renders radar, normalized trend, damage composition, and highlight badges', () => {
    render(<PlayerStatsView stats={stats()} />);

    expect(screen.getByRole('heading', { name: '六边形能力图' })).toBeInTheDocument();
    expect(screen.getAllByText('输出').length).toBeGreaterThan(0);
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '输出 / 视野趋势' })).toBeInTheDocument();
    expect(screen.getByText('归一化到 0-100')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '伤害构成' })).toBeInTheDocument();
    expect(screen.getByText('物理 / 魔法 / 真实')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '高光徽标' })).toBeInTheDocument();
    expect(screen.getByText('只显示次数，不显示事件时间')).toBeInTheDocument();
    expect(screen.queryByText('高光时间线')).not.toBeInTheDocument();
    expect(screen.queryByText('06:12')).not.toBeInTheDocument();
  });

  it('shows small sample warning and trend fallback when data is sparse', () => {
    const sparse = stats({
      extended: {
        ...stats().extended,
        sourceGames: 2,
        radar: { ...stats().extended.radar, sourceGames: 2, comparisonPlayers: 2, sampleSizeWarning: true },
        trends: stats().extended.trends.slice(0, 2),
      },
    });
    render(<PlayerStatsView stats={sparse} />);

    expect(screen.getByText(/小样本，仅供参考/)).toBeInTheDocument();
    expect(screen.getByText('少于 3 场，不画趋势线。')).toBeInTheDocument();
  });

  it('expands per-game details and shows raw extStats keys', () => {
    render(<PlayerStatsView stats={stats()} />);

    expect(screen.getByText('召唤师技能')).toBeInTheDocument();
    expect(screen.getByText('14 / 4')).toBeInTheDocument();
    const raw = screen.getByText('原始 extStats 字段');
    fireEvent.click(raw);
    expect(screen.getByText(/unknownFutureKey/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /小组赛 R4/ }));
    expect(screen.getByText('4 / 11')).toBeInTheDocument();
  });

  it('renders clear empty states when no extended data exists', () => {
    const empty = stats({
      extended: {
        sourceGames: 0,
        totalGames: 3,
        averages: Object.fromEntries(Object.keys(stats().extended.averages).map((key) => [key, null])) as PlayerTournamentStats['extended']['averages'],
        totals: { ...stats().extended.totals, firstBloodKills: 0, firstBloodAssists: 0, turretKills: 0, tripleKills: 0, largestMultiKill: null, largestKillingSpree: null },
        radar: { sourceGames: 0, comparisonPlayers: 0, sampleSizeWarning: true, output: null, economy: null, vision: null, survival: null, objective: null, teamfight: null },
        trends: [],
      },
      games: stats().games.map((game) => ({ ...game, extended: null })),
    });
    render(<PlayerStatsView stats={empty} />);

    expect(screen.getAllByText('暂无扩展数据').length).toBeGreaterThan(0);
    expect(screen.getByText('暂无趋势数据')).toBeInTheDocument();
    expect(screen.getByText('暂无伤害构成数据')).toBeInTheDocument();
    expect(screen.getByText('暂无高光事件数据')).toBeInTheDocument();
  });
});
