import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { CaptainNav } from '@/components/layout/CaptainNav';

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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-4 border-b px-6">
        <span className="text-sm font-semibold text-foreground">LOL大王杯</span>
        <CaptainNav showTeamManagement={showTeamManagement} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.user.username}</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
          <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col p-6">{children}</main>
    </div>
  );
}
