import { describe, expect, it } from 'vitest';
import { buildHomeEntries, getTournamentStatusText, type PublicHomeContext } from './public-home';

function ctx(overrides: Partial<PublicHomeContext> = {}): PublicHomeContext {
  return {
    tournament: { name: '夏季赛', status: 'REGISTRATION' },
    bracket: { status: 'SETUP' },
    ...overrides,
  };
}

describe('public homepage view model', () => {
  it('prioritizes registration during REGISTRATION', () => {
    const entries = buildHomeEntries(ctx());
    expect(entries[0]).toMatchObject({ id: 'register', href: '/register', emphasis: 'primary' });
    expect(entries.map((e) => e.id)).toEqual([
      'register',
      'tournament',
      'leaderboard',
      'live',
      'login',
    ]);
  });

  it('prioritizes live draft during DRAFTING', () => {
    const entries = buildHomeEntries(ctx({ tournament: { name: '夏季赛', status: 'DRAFTING' } }));
    expect(entries[0]).toMatchObject({ id: 'live', href: '/live', emphasis: 'primary' });
    expect(entries.map((e) => e.id)).toEqual([
      'live',
      'tournament',
      'leaderboard',
      'register',
      'login',
    ]);
  });

  it('keeps login available when no active season exists', () => {
    const entries = buildHomeEntries({ tournament: null, bracket: null });
    expect(entries.map((e) => e.id)).toEqual(['login']);
    expect(entries[0].href).toBe('/login');
  });

  it('uses season status text without exposing private details', () => {
    expect(getTournamentStatusText(ctx()).headline).toBe('夏季赛报名开放中');
    expect(getTournamentStatusText({ tournament: null, bracket: null }).headline).toBe('暂无开放赛事');
  });

  it('renders tournament status as Chinese text, not the raw enum', () => {
    expect(getTournamentStatusText(ctx({ bracket: { status: 'GROUP_STAGE' } })).description).toBe(
      '小组赛进行中',
    );
    expect(getTournamentStatusText(ctx({ bracket: null })).description).toBe('赛事暂未创建');
  });

  it('does not fall through to the SETUP "准备中" headline during active bracket phases', () => {
    for (const status of ['GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'] as const) {
      const { headline } = getTournamentStatusText(ctx({ tournament: { name: '夏季赛', status } }));
      expect(headline).not.toBe('夏季赛准备中');
    }
    // post-draft phases prioritize the tournament/bracket entry, not registration
    const entries = buildHomeEntries(ctx({ tournament: { name: '夏季赛', status: 'GROUP_STAGE' } }));
    expect(entries[0]).toMatchObject({ id: 'tournament', emphasis: 'primary' });
  });
});
