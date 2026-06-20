import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDetailView, type MatchDetail } from './MatchDetailView';

const detail: MatchDetail = {
  id: 'match-1',
  label: '半决赛 2',
  roundKey: 'SF',
  bestOf: 3,
  status: 'FINISHED',
  scheduledAt: null,
  teamA: { id: 'team-a', name: '星河战队' },
  teamB: { id: 'team-b', name: '北境战队' },
  winnerTeamId: 'team-a',
  games: [
    {
      id: 'game-1',
      index: 0,
      blueTeamId: 'team-a',
      winnerTeamId: 'team-a',
      durationSeconds: 1845,
      mvpRegistrationId: 'reg-nightfox',
      bans: [
        {
          teamId: 'team-a',
          type: 'BAN',
          championId: 'Ahri',
          championName: '阿狸',
          order: 1,
        },
      ],
      players: [
        {
          registrationId: 'reg-nightfox',
          playerId: 'player-nightfox',
          nickname: 'NightFox',
          teamId: 'team-a',
          championId: 'Ahri',
          championName: '阿狸',
          kills: 7,
          deaths: 1,
          assists: 8,
          cs: 240,
          damage: 34120,
          gold: 14860,
        },
        {
          registrationId: 'reg-frost',
          playerId: 'player-frost',
          nickname: 'Frost',
          teamId: 'team-b',
          championId: 'Sylas',
          championName: '塞拉斯',
          kills: 3,
          deaths: 4,
          assists: 5,
          cs: 205,
          damage: 21700,
          gold: 11330,
        },
      ],
    },
  ],
};

describe('MatchDetailView', () => {
  it('renders a match-detail landing shape with return link, score, and game sections', () => {
    render(<MatchDetailView detail={detail} />);

    expect(screen.getByText('LOL-SYSTEM / MATCH ARCHIVE')).toBeInTheDocument();
    expect(screen.getByText('/TOURNAMENT/MATCH/[ID]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回赛事页' })).toHaveAttribute(
      'href',
      '/tournament',
    );
    expect(screen.getByRole('heading', { name: 'MATCH CONTROL RECORD' })).toBeInTheDocument();
    expect(screen.getAllByText('半决赛 2').length).toBeGreaterThan(0);
    expect(screen.getByText('SF · BO3')).toBeInTheDocument();
    expect(screen.getByText('星河战队 胜')).toBeInTheDocument();

    const sideSummary = screen.getByLabelText('第 1 局蓝红方');
    expect(within(sideSummary).getByText('星河战队（蓝）')).toBeInTheDocument();
    expect(within(sideSummary).getByText('北境战队（红）')).toBeInTheDocument();

    expect(screen.getByText('BP 时间线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NightFox' })).toHaveAttribute(
      'href',
      '/tournament/player/player-nightfox',
    );
    expect(screen.getByText('MVP')).toBeInTheDocument();
  });
});
