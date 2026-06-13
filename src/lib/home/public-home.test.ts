import { describe, expect, it } from 'vitest';
import { buildHomeEntries, getSeasonStatusText, type PublicHomeContext } from './public-home';

function ctx(overrides: Partial<PublicHomeContext> = {}): PublicHomeContext {
  return {
    season: { name: '夏季赛', status: 'REGISTRATION' },
    tournament: { status: 'SETUP' },
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
    const entries = buildHomeEntries(ctx({ season: { name: '夏季赛', status: 'DRAFTING' } }));
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
    const entries = buildHomeEntries({ season: null, tournament: null });
    expect(entries.map((e) => e.id)).toEqual(['login']);
    expect(entries[0].href).toBe('/login');
  });

  it('uses season status text without exposing private details', () => {
    expect(getSeasonStatusText(ctx()).headline).toBe('夏季赛报名开放中');
    expect(getSeasonStatusText({ season: null, tournament: null }).headline).toBe('暂无开放赛季');
  });
});
