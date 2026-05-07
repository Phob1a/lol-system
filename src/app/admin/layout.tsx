import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AdminNav } from '@/components/layout/AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tc-bg-0)' }}>
      <AdminNav gameId={session.user.gameId} />
      <main style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</main>
    </div>
  );
}
