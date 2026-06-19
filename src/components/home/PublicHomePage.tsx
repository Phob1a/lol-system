import Link from 'next/link';
import { ArrowRight, BarChart3, LogIn, RadioTower, Trophy, UserPlus } from 'lucide-react';
import {
  ArenaCta,
  ArenaPanel,
  ArenaStatCard,
  PublicArenaHud,
  PublicArenaShell,
} from '@/components/public-arena';
import {
  buildHomeEntries,
  getTournamentStatusText,
  type PublicHomeContext,
} from '@/lib/home/public-home';
import {
  getGatewayPrimaryHref,
  getGatewayPrimaryLabel,
  getGatewaySignals,
} from '@/lib/home/public-home-arena';

type Props = {
  context: PublicHomeContext;
};

export function PublicHomePage({ context }: Props) {
  const entries = buildHomeEntries(context);
  const status = getTournamentStatusText(context);
  const primaryHref = getGatewayPrimaryHref(context);
  const primaryLabel = getGatewayPrimaryLabel(primaryHref);
  const visibleEntryCount = entries.filter((entry) => entry.emphasis !== 'muted').length;

  const stats = [
    {
      label: 'SEASON STATUS',
      value: context.tournament?.status ?? 'STANDBY',
      detail: context.tournament?.name ?? '等待新赛季',
      icon: Trophy,
      tone: 'amber' as const,
    },
    {
      label: 'PUBLIC ROUTES',
      value: String(entries.length),
      detail: `${visibleEntryCount} 个主入口`,
      icon: RadioTower,
      tone: 'cyan' as const,
    },
    {
      label: 'BRACKET DATA',
      value: context.bracket?.status ?? 'READY',
      detail: context.bracket ? '赛事数据已连接' : '等待赛事数据',
      icon: BarChart3,
      tone: 'emerald' as const,
    },
  ];

  return (
    <PublicArenaShell
      className="min-h-screen"
      hud={
        <PublicArenaHud
          eyebrow="LOL-SYSTEM / PUBLIC GATEWAY"
          title="公开观赛入口"
          signals={getGatewaySignals(context)}
          actions={
            <ArenaCta href="/login" variant="ghost">
              <LogIn className="mr-2 h-4 w-4" />
              登录
            </ArenaCta>
          }
        />
      }
    >
      <ArenaPanel className="arena-scanline p-5 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              PUBLIC ACCESS NODE
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black leading-none text-white md:text-6xl">
              {status.headline}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              {status.description}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ArenaCta href={primaryHref} className="gap-2 px-5 py-3">
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </ArenaCta>
              <ArenaCta href="/tournament" variant="secondary" className="px-5 py-3">
                赛事中心
              </ArenaCta>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((item) => (
              <ArenaStatCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.value}
                detail={item.detail}
                tone={item.tone}
              />
            ))}
          </div>
        </div>
      </ArenaPanel>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="公开入口">
        {entries.map((item) => {
          const isPrimary = item.emphasis === 'primary';
          const Icon = item.id === 'register' ? UserPlus : item.id === 'live' ? RadioTower : Trophy;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={[
                'arena-panel arena-corner group flex min-h-44 flex-col justify-between overflow-hidden p-5 transition hover:translate-y-[-2px]',
                isPrimary ? 'border-cyan-200/55 bg-cyan-200/10' : '',
                item.emphasis === 'muted' ? 'opacity-75' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>
                <span className="flex items-center justify-between gap-3">
                  <span className="text-base font-bold text-white">{item.title}</span>
                  <Icon className="h-4 w-4 shrink-0 text-cyan-200" />
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-300">
                  {item.description}
                </span>
              </span>
              <span className="mt-5 inline-flex items-center text-sm font-semibold text-cyan-100">
                进入
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>
    </PublicArenaShell>
  );
}
