import { fireEvent, render, screen } from '@testing-library/react';
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
    killParticipation: 58.3,
    bestWinStreak: 2,
    careerHighs: {
      maxDamage: { gameId: 'game-1', matchLabel: '半决赛 G1', championId: 'Smolder', championName: '斯莫德', value: 30423 },
      maxKills: { gameId: 'game-1', matchLabel: '半决赛 G1', championId: 'Smolder', championName: '斯莫德', value: 8 },
      maxKda: { gameId: 'game-1', matchLabel: '半决赛 G1', championId: 'Smolder', championName: '斯莫德', value: 5.67 },
      longestTimeSpentLiving: 482,
    },
    roleTag: '输出核心',
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
    commonChampions: [
      { championId: 'Smolder', championName: '斯莫德', games: 2, wins: 2, winRate: 100, kda: 5.6, avgDamage: 25000 },
    ],
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
        extended: null,
      },
    ],
    ...overrides,
  };
  return base;
}

describe('PlayerStatsView fan-facing profile', () => {
  it('renders hero identity, role tag, KP and recent form', () => {
    render(<PlayerStatsView stats={stats()} />);

    expect(screen.getByText('LOL-SYSTEM / PLAYER DOSSIER')).toBeInTheDocument();
    expect(screen.getByText('PLAYER DOSSIER')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '夜阑惊梦' })).toBeInTheDocument();
    expect(screen.getByText('输出核心')).toBeInTheDocument();
    expect(screen.getByText('58.3%')).toBeInTheDocument(); // 参团率
    expect(screen.getByText('2 连胜')).toBeInTheDocument();
    expect(screen.getAllByTitle('胜').length).toBeGreaterThan(0);
  });

  it('renders champion pool, signature game and career highs', () => {
    render(<PlayerStatsView stats={stats()} />);

    expect(screen.getByRole('heading', { name: '招牌英雄池' })).toBeInTheDocument();
    expect(screen.getByText('代表作')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '生涯纪录' })).toBeInTheDocument();
    expect(screen.getByText('单场最高伤害')).toBeInTheDocument();
    expect(screen.getByText('8:02')).toBeInTheDocument(); // 最长存活 482s
  });

  it('splits highlights into rare and participation tiers without a timeline', () => {
    render(<PlayerStatsView stats={stats()} />);

    expect(screen.getByRole('heading', { name: '累计高光徽章' })).toBeInTheDocument();
    expect(screen.getByText('稀有高光')).toBeInTheDocument();
    expect(screen.getByText('参与高光')).toBeInTheDocument();
    expect(screen.queryByText(/高光时间线/)).not.toBeInTheDocument();
  });

  it('expands per-game detail and reveals raw extStats only when present', () => {
    render(<PlayerStatsView stats={stats()} />);

    // 首局默认展开
    expect(screen.getByText('英雄等级')).toBeInTheDocument();
    expect(screen.getByText('伤害构成（本局）')).toBeInTheDocument();
    const raw = screen.getByText(/原始 extStats 字段/);
    fireEvent.click(raw);
    expect(screen.getByText(/unknownFutureKey/)).toBeInTheDocument();
  });

  it('renders empty states when there is no data', () => {
    const empty = stats({
      summary: { ...stats().summary, games: 0, wins: 0, winRate: 0, mvpCount: 0 },
      killParticipation: null,
      bestWinStreak: 0,
      careerHighs: { maxDamage: null, maxKills: null, maxKda: null, longestTimeSpentLiving: null },
      roleTag: null,
      commonChampions: [],
      games: [],
    });
    render(<PlayerStatsView stats={empty} />);

    expect(screen.getByText('暂无英雄数据')).toBeInTheDocument();
    expect(screen.getByText('暂无纪录数据')).toBeInTheDocument();
    expect(screen.getByText('暂无对局记录')).toBeInTheDocument();
  });
});
