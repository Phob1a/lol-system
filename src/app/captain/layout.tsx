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
  if (session.user.role !== 'CAPTAIN' || !session.user.isCaptain || session.user.isRetired) {
    redirect('/access-denied');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tc-bg-0)' }}>
      <CaptainNav
        gameId={session.user.gameId}
        nickname={session.user.nickname}
      />
      <main style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</main>
    </div>
  );
}
