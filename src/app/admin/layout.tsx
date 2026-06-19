import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/workspace-console/WorkspaceHeader';
import { WorkspaceMetric } from '@/components/workspace-console/WorkspaceMetric';
import { WorkspaceShell } from '@/components/workspace-console/WorkspaceShell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');

  return (
    <WorkspaceShell
      sidebar={<AppSidebar />}
      header={
        <WorkspaceHeader
          eyebrow="Admin Console"
          title="管理后台"
          description="赛事、报名、队伍、选秀与审计"
          signals={<WorkspaceMetric label="Operator" value={session.user.username} />}
          actions={
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page
            <a
              href="/api/auth/signout"
              className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-200/35 hover:text-white"
            >
              登出
            </a>
          }
        />
      }
    >
      {children}
    </WorkspaceShell>
  );
}
