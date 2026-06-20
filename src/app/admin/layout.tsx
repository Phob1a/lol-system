import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-ink lg:flex">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-nexus-line bg-nexus-panel px-4 lg:px-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-faint">
            管理后台
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-nexus-dim">{session.user.username}</span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
            <a
              href="/api/auth/signout"
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-nexus-dim transition-colors hover:text-nexus-accent"
            >
              登出
            </a>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
