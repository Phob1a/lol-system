import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { RegistrationForm } from '@/components/registration/RegistrationForm';
import {
  ArenaCta,
  ArenaEmptyState,
  ArenaPanel,
  PublicArenaHud,
  PublicArenaShell,
} from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const tournament = await getActiveTournament(prisma);
  if (tournament?.status !== 'REGISTRATION') {
    return (
      <PublicArenaShell
        hud={<PublicArenaHud eyebrow="SUMMONER REGISTRY" title="赛事报名通道" />}
        contentClassName="min-h-[calc(100vh-4rem)] justify-center"
      >
        <ArenaEmptyState
          eyebrow="REGISTRATION CLOSED"
          title="报名未开放"
          description={
            tournament ? '本赛事报名已截止或未开放。' : '当前没有开放报名的赛事。'
          }
          action={<ArenaCta href="/">回到首页</ArenaCta>}
        />
      </PublicArenaShell>
    );
  }
  return (
    <PublicArenaShell
      hud={
        <PublicArenaHud
          eyebrow="SUMMONER REGISTRY"
          title="赛事报名通道"
          signals={[{ label: 'Status', detail: 'Open' }]}
        />
      }
      contentClassName="grid min-h-[calc(100vh-4rem)] gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"
    >
      <ArenaPanel className="p-6 lg:sticky lg:top-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
          PLAYER INTAKE
        </p>
        <h1 className="mt-4 text-3xl font-black text-white md:text-4xl">赛事报名</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          提交游戏 ID、常用位置、段位和队长意向。管理员审核通过后，选秀池会同步更新。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-cyan-200/20 bg-cyan-200/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/65">
              Event
            </div>
            <div className="mt-2 font-bold text-white">{tournament.name}</div>
          </div>
          <div className="rounded border border-amber-200/20 bg-amber-200/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">
              Status
            </div>
            <div className="mt-2 font-bold text-white">Open</div>
          </div>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex text-sm font-semibold text-cyan-100 hover:text-white"
        >
          返回赛事首页
        </Link>
      </ArenaPanel>

      <ArenaPanel className="p-5 md:p-6">
        <RegistrationForm tournamentName={tournament.name} variant="arena" />
      </ArenaPanel>
    </PublicArenaShell>
  );
}
