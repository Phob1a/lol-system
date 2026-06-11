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
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
          <span className="text-sm text-muted-foreground">管理后台</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{session.user.username}</span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
            <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
