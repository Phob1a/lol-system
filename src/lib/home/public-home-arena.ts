import type { ArenaSignal } from '@/components/public-arena';
import type { PublicHomeContext } from './public-home';

export function getGatewayPrimaryHref(context: PublicHomeContext): string {
  if (context.tournament?.status === 'DRAFTING') return '/live';
  if (context.tournament?.status === 'REGISTRATION') return '/register';
  if (context.tournament) return '/tournament';
  return '/login';
}

export function getGatewayPrimaryLabel(href: string): string {
  switch (href) {
    case '/live':
      return '进入直播间';
    case '/tournament':
      return '进入赛事中心';
    case '/register':
      return '报名入口';
    default:
      return '登录系统';
  }
}

export function getGatewaySignals(context: PublicHomeContext): ArenaSignal[] {
  return [
    { label: 'TOURNAMENT', detail: context.tournament?.status ?? 'STANDBY' },
    {
      label: 'REGISTRATION',
      detail: context.tournament?.status === 'REGISTRATION' ? 'OPEN' : 'LOCKED',
    },
    { label: 'DATA', detail: context.bracket ? context.bracket.status : 'READY' },
  ];
}
