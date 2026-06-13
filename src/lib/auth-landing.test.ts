import { describe, expect, it } from 'vitest';
import { getPostAuthRedirect } from './auth-landing';

describe('post-auth redirect target', () => {
  it('sends admins to the admin dashboard when no callback is provided', () => {
    expect(getPostAuthRedirect({ role: 'ADMIN' })).toBe('/admin');
  });

  it('sends captains to the captain dashboard when no callback is provided', () => {
    expect(getPostAuthRedirect({ role: 'CAPTAIN' })).toBe('/captain');
  });

  it('keeps an explicit callback url when one is provided', () => {
    expect(getPostAuthRedirect({ role: 'ADMIN', callbackUrl: '/admin/tournament' })).toBe(
      '/admin/tournament',
    );
  });

  it('sends users who must change password to the password change flow', () => {
    expect(
      getPostAuthRedirect({
        role: 'ADMIN',
        callbackUrl: '/admin',
        mustChangePwd: true,
      }),
    ).toBe('/change-password');
  });
});
