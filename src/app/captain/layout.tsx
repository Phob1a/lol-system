import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="text-sm font-semibold text-foreground">LoL 选人系统</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.user.username}</span>
          <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
