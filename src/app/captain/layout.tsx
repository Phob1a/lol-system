import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CaptainNav } from '@/components/layout/CaptainNav';

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
    <div style={{ minHeight: '100vh', background: 'var(--tc-bg-0)' }}>
      <CaptainNav
        gameId={session.user.username}
        nickname={session.user.username}
      />
      <main style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</main>
    </div>
  );
}
