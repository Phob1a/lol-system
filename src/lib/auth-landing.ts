export type AuthLandingRole = 'ADMIN' | 'CAPTAIN';

export function getPostAuthRedirect({
  role,
  callbackUrl,
  mustChangePwd,
}: {
  role: AuthLandingRole;
  callbackUrl?: string | null;
  mustChangePwd?: boolean;
}) {
  if (mustChangePwd) return '/change-password';
  if (callbackUrl) return callbackUrl;
  return role === 'CAPTAIN' ? '/captain' : '/admin';
}
