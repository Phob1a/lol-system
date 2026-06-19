import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { CaptainNav } from '@/components/layout/CaptainNav';
import { WorkspaceHeader } from '@/components/workspace-console/WorkspaceHeader';
import { WorkspaceMetric } from '@/components/workspace-console/WorkspaceMetric';
import { WorkspaceShell } from '@/components/workspace-console/WorkspaceShell';

const TEAM_MGMT_OPEN = ['GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'];

export default async function CaptainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'CAPTAIN') {
    redirect('/access-denied');
  }

  const tournament = await getActiveTournament(prisma);
  const showTeamManagement = tournament ? TEAM_MGMT_OPEN.includes(tournament.status) : false;

  return (
    <WorkspaceShell
      header={
        <div className="relative z-10 border-b border-cyan-200/15 bg-slate-950/55 backdrop-blur-xl">
          <WorkspaceHeader
            eyebrow="Captain Console"
            title="队长工作台"
            description={tournament?.name ?? '等待赛事开启'}
            signals={<WorkspaceMetric label="Captain" value={session.user.username} />}
            actions={
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page
              <a
                href="/api/auth/signout"
                className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-200/35 hover:text-white"
              >
                登出
              </a>
            }
            className="border-b-0 bg-transparent"
          />
          <div className="px-4 pb-4 lg:px-6">
            <CaptainNav showTeamManagement={showTeamManagement} />
          </div>
        </div>
      }
      contentClassName="p-4 lg:p-6"
    >
      {children}
    </WorkspaceShell>
  );
}
