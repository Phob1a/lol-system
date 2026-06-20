import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Brackets,
  LogIn,
  RadioTower,
  Trophy,
  UserPlus,
} from 'lucide-react';
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
  const routeTiles = [
    { code: 'REG', label: '报名入口', href: '/register', detail: '报名入口' },
    { code: 'LIVE', label: '实时观赛', href: '/live', detail: '选秀直播' },
    { code: 'DATA', label: '选手榜单', href: '/tournament', detail: '赛事数据' },
  ];
  const pulseBars = [38, 54, 72, 48, 82, 64, 76, 58, 88, 70, 62, 80];

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
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-stretch">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              / PUBLIC PORTAL
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.92] text-white md:text-7xl">
              进入
              <br />
              赛事主控台
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              公开首页改成赛事控制门户：报名、赛事中心、直播、数据榜都从统一控制台进入，后台仍作为低优先级入口。
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

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {routeTiles.map((tile) => (
                <Link
                  key={tile.code}
                  href={tile.href}
                  className="rounded-sm border border-cyan-200/18 bg-slate-950/35 p-4 transition hover:border-cyan-200/45 hover:bg-cyan-200/10"
                >
                  <span className="block text-2xl font-black uppercase text-white">
                    {tile.code}
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-slate-300">
                    {tile.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {tile.detail}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-6 rounded-sm border border-cyan-200/15 bg-slate-950/35 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
                CURRENT SIGNAL
              </p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xl font-black text-white">{status.headline}</p>
                  <p className="mt-1 text-xs text-slate-400">{status.description}</p>
                </div>
                <span className="inline-flex h-12 w-16 shrink-0 items-center justify-center border border-cyan-200/25 bg-cyan-200/5 text-sm font-black text-cyan-100">
                  {context.tournament?.status === 'REGISTRATION' ? 'OPEN' : 'SYNC'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr] xl:grid-cols-1">
            <div className="rounded-sm border border-cyan-200/15 bg-slate-950/35 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                  TEAM PULSE
                </p>
                <RadioTower className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="mt-5 flex h-20 items-end gap-2">
                {pulseBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500/35 via-cyan-200/75 to-white shadow-[0_0_18px_rgba(94,231,255,0.35)]"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <span className="border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Auto Sync
                </span>
                <span className="border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Event Feed
                </span>
              </div>
            </div>

            <div className="grid gap-3">
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
        </div>
      </ArenaPanel>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="公开入口">
        {entries.map((item) => {
          const isPrimary = item.emphasis === 'primary';
          const Icon =
            item.id === 'register'
              ? UserPlus
              : item.id === 'live'
                ? RadioTower
                : item.id === 'leaderboard'
                  ? BarChart3
                  : item.id === 'tournament'
                    ? Brackets
                    : Trophy;

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
