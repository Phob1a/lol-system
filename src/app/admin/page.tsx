import Link from 'next/link';
import { Activity, ClipboardList, Database, ShieldCheck, Trophy } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getAdminOverviewStats } from '@/lib/admin/overview-stats';
import { ArenaCta, ArenaEmptyState, ArenaPanel } from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const tournament = await getActiveTournament(prisma);

  const overviewStats = tournament
    ? await getAdminOverviewStats(prisma, tournament.id)
    : { registrationCount: 0, captainIntentionCount: 0, draftStatus: 'NOT_STARTED' };

  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="NO TOURNAMENT"
        title="尚无赛事"
        description="先创建赛事，控制台才会生成报名、队伍、选秀和审计链路。"
        action={<ArenaCta href="/admin/tournament">前往赛事管理</ArenaCta>}
      />
    );
  }

  const statCards = [
    {
      label: 'TOURNAMENT',
      value: `${tournament.name} · ${tournament.status} · 预算 ${tournament.teamBudget} CR`,
      href: '/admin/tournament',
      icon: Trophy,
      tone: 'text-amber-100',
    },
    {
      label: 'REGISTRATIONS',
      value: `${overviewStats.registrationCount} 报名 · ${overviewStats.captainIntentionCount} 意向队长`,
      href: '/admin/registrations',
      icon: ClipboardList,
      tone: 'text-cyan-100',
    },
    {
      label: 'DRAFT',
      value: overviewStats.draftStatus,
      href: '/admin/draft',
      icon: Activity,
      tone: 'text-violet-100',
    },
    {
      label: 'AUDIT',
      value: '事件日志 · seq monotonic',
      href: '/admin/audit',
      icon: ShieldCheck,
      tone: 'text-emerald-100',
    },
    {
      label: 'IMPORTS',
      value: '对局导入 · LCU JSON 审核',
      href: '/admin/imports',
      icon: Database,
      tone: 'text-sky-100',
    },
  ];

  return (
    <div className="space-y-5">
      <ArenaPanel className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
              COMMAND OVERVIEW
            </p>
            <h2 className="mt-3 text-2xl font-black text-white md:text-3xl">
              {tournament.name}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              当前状态 {tournament.status}，队伍预算 {tournament.teamBudget} CR。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-cyan-200/20 bg-cyan-200/10 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/65">
                Players
              </div>
              <div className="mt-1 text-2xl font-black text-white">
                {overviewStats.registrationCount}
              </div>
            </div>
            <div className="rounded border border-amber-200/20 bg-amber-200/10 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">
                Captains
              </div>
              <div className="mt-1 text-2xl font-black text-white">
                {overviewStats.captainIntentionCount}
              </div>
            </div>
          </div>
        </div>
      </ArenaPanel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
          <Link key={s.href} href={s.href} className="group block">
            <ArenaPanel className="h-full p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-cyan-100/45">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/65">
                    {s.label}
                  </p>
                  <p className="mt-3 text-lg font-bold leading-snug text-white">{s.value}</p>
                </div>
                <Icon className={`h-5 w-5 shrink-0 ${s.tone}`} />
              </div>
              <div className="mt-4 h-1 rounded-full bg-white/10">
                <div className="h-full w-2/3 rounded-full bg-cyan-200/70 shadow-[0_0_18px_rgba(94,231,255,0.5)]" />
              </div>
            </ArenaPanel>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
