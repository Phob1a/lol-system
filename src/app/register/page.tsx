import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { RegistrationForm } from '@/components/registration/RegistrationForm';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Kicker from '@/components/nexus/Kicker';
import NexusButton from '@/components/nexus/NexusButton';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const tournament = await getActiveTournament(prisma);

  if (tournament?.status !== 'REGISTRATION') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <Panel className="w-full max-w-sm">
          <PanelHead title="ENLIST · 报名注册" />
          <div className="p-6 space-y-4">
            <Kicker className="block mb-3">
              {tournament ? '报名已截止' : '当前无活跃赛事'}
            </Kicker>
            <p className="font-body text-sm" style={{ color: 'rgb(var(--ink))' }}>
              {tournament
                ? '本赛事报名已截止或未开放。'
                : '当前没有开放报名的赛事。'}
            </p>
            <p className="font-mono text-[11px]" style={{ color: 'rgb(var(--faint))' }}>
              请关注赛事通知；开放报名后可再次回到此页面提交信息。
            </p>
            <NexusButton className="w-full" type="button">
              <Link href="/">回到首页</Link>
            </NexusButton>
          </div>
        </Panel>
      </div>
    );
  }

  // Fetch registration overview counts for the sidebar 报名概况 panel
  const [registrationCount, captainCount] = await Promise.all([
    prisma.registration.count({
      where: { tournamentId: tournament.id, status: 'ACTIVE' },
    }),
    prisma.registration.count({
      where: {
        tournamentId: tournament.id,
        status: 'ACTIVE',
        willingToCaptain: true,
      },
    }),
  ]);

  return (
    <RegistrationForm
      tournamentName={tournament.name}
      registrationCount={registrationCount}
      captainCount={captainCount}
    />
  );
}
