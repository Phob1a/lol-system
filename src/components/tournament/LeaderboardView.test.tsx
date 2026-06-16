import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeaderboardView, type PlayerProfile } from './LeaderboardView';

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    registrationId: 'reg-nightfox',
    playerId: 'player-nightfox',
    nickname: 'NightFox',
    teamName: '星河战队',
    primaryPosition: 'MID',
    summary: {
      games: 12,
      wins: 9,
      winRate: 75,
      avgKills: 4.8,
      avgDeaths: 1.7,
      avgAssists: 6.1,
      kda: 6.42,
      avgCs: 221,
      avgDamage: 29400,
      avgGold: 13200,
      mvpCount: 4,
    },
    recentForm: [true, false, true, true, true, false, true, true],
    commonChampions: [
      {
        championId: 'Ahri',
        championName: '阿狸',
        games: 5,
        wins: 4,
        winRate: 80,
        kda: 7.1,
        avgDamage: 30200,
      },
    ],
    games: [
      {
        gameId: 'game-1',
        matchId: 'match-1',
        matchLabel: '半决赛 2',
        opponent: '北境战队',
        championId: 'Ahri',
        championName: '阿狸',
        kills: 7,
        deaths: 1,
        assists: 8,
        cs: 240,
        damage: 34120,
        gold: 14860,
        win: true,
        isMvp: true,
      },
      {
        gameId: 'game-2',
        matchId: 'match-2',
        matchLabel: '小组赛 R4',
        opponent: '霜火战队',
        championId: 'Sylas',
        championName: '塞拉斯',
        kills: 3,
        deaths: 4,
        assists: 5,
        cs: 205,
        damage: 21700,
        gold: 11330,
        win: false,
        isMvp: false,
      },
    ],
    ...overrides,
  };
}

describe('LeaderboardView profile explorer', () => {
  it('selects the first profile by default and shows the mixed profile layout', () => {
    render(<LeaderboardView initialProfiles={[profile()]} />);

    expect(screen.getByRole('heading', { name: 'NightFox' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getAllByText('6.42').length).toBeGreaterThan(0);
    expect(screen.getByText('最近 8 场走势')).toBeInTheDocument();
    expect(screen.getByText('常用英雄')).toBeInTheDocument();
    expect(screen.getByText('最近比赛记录')).toBeInTheDocument();
  });

  it('switches selected profile from the selector', () => {
    render(
      <LeaderboardView
        initialProfiles={[
          profile(),
          profile({
            registrationId: 'reg-bluerain',
            playerId: 'player-bluerain',
            nickname: 'BlueRain',
            teamName: '霜火战队',
            primaryPosition: 'ADC',
            summary: { ...profile().summary, winRate: 63.6, kda: 4.2, avgDamage: 31200 },
            recentForm: [false, true],
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /BlueRain/ }));

    expect(screen.getByRole('heading', { name: 'BlueRain' })).toBeInTheDocument();
    expect(screen.getByText('63.6%')).toBeInTheDocument();
    expect(screen.getAllByText('霜火战队').length).toBeGreaterThan(0);
  });

  it('filters player selector by nickname and team', () => {
    render(
      <LeaderboardView
        initialProfiles={[
          profile(),
          profile({
            registrationId: 'reg-kite',
            playerId: 'player-kite',
            nickname: 'Kite',
            teamName: '北境战队',
            primaryPosition: 'JUNGLE',
          }),
        ]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('搜索选手 / 队伍 / 位置'), {
      target: { value: '北境' },
    });

    expect(screen.queryByRole('button', { name: /NightFox/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kite/ })).toBeInTheDocument();
  });

  it('renders recent form as win/loss tiles', () => {
    render(<LeaderboardView initialProfiles={[profile({ recentForm: [true, false, true] })]} />);

    const strip = screen.getByLabelText('最近 8 场走势');
    expect(within(strip).getAllByText('W')).toHaveLength(2);
    expect(within(strip).getByText('L')).toBeInTheDocument();
  });

  it('shows an explicit match-detail link in recent games', () => {
    render(<LeaderboardView initialProfiles={[profile()]} />);

    expect(screen.getByRole('link', { name: '查看 半决赛 2' })).toHaveAttribute(
      'href',
      '/tournament/match/match-1',
    );
  });
});
