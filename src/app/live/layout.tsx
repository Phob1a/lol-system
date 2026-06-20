import type { ReactNode } from 'react';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import PublicShell from '@/components/layout/PublicShell';

export const dynamic = 'force-dynamic';

export default async function LiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tournament = await getActiveTournament(prisma);

  return (
    <PublicShell
      tournament={
        tournament
          ? { name: tournament.name, status: tournament.status }
          : null
      }
    >
      {children}
    </PublicShell>
  );
}
