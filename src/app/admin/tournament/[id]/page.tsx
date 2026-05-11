import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { TournamentTabs } from './_components/TournamentTabs';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');
  const { id } = await params;
  const exists = await db.tournament.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  return <TournamentTabs tournamentId={id} />;
}
