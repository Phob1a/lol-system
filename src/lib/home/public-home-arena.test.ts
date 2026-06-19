import { describe, expect, it } from 'vitest';
import type { PublicHomeContext } from './public-home';
import { getGatewayPrimaryHref, getGatewayPrimaryLabel, getGatewaySignals } from './public-home-arena';

function context(overrides: Partial<PublicHomeContext> = {}): PublicHomeContext {
  return {
    tournament: null,
    bracket: null,
    ...overrides,
  };
}

describe('public home arena helpers', () => {
  it('routes primary CTA to live when a draft is active', () => {
    expect(
      getGatewayPrimaryHref(
        context({
          tournament: { name: 'S1', status: 'DRAFTING' },
        }),
      ),
    ).toBe('/live');
  });

  it('routes primary CTA to tournament when a public tournament exists outside registration and draft', () => {
    expect(
      getGatewayPrimaryHref(
        context({
          tournament: { name: 'S1', status: 'GROUP_STAGE' },
        }),
      ),
    ).toBe('/tournament');
  });

  it('returns labels for the supported primary routes', () => {
    expect(getGatewayPrimaryLabel('/live')).toBe('进入直播间');
    expect(getGatewayPrimaryLabel('/tournament')).toBe('进入赛事中心');
    expect(getGatewayPrimaryLabel('/register')).toBe('报名入口');
    expect(getGatewayPrimaryLabel('/login')).toBe('登录系统');
  });

  it('returns status signals grounded in home context', () => {
    expect(
      getGatewaySignals(
        context({
          tournament: { name: 'S1', status: 'REGISTRATION' },
          bracket: { status: 'SETUP' },
        }),
      ),
    ).toEqual([
      { label: 'TOURNAMENT', detail: 'REGISTRATION' },
      { label: 'REGISTRATION', detail: 'OPEN' },
      { label: 'DATA', detail: 'SETUP' },
    ]);
  });
});
