import type { ReactNode } from 'react';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function TournamentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tournament = await getActiveTournament(prisma);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            {tournament ? (
              <>
                <h1 className="text-lg font-semibold">{tournament.name}</h1>
                <Badge variant="secondary">{tournament.kind}</Badge>
              </>
            ) : (
              <h1 className="text-lg font-semibold">赛事</h1>
            )}
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
