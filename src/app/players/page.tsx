/**
 * /players — NEXUS public Players screen (选手目录 / 观测档案).
 *
 * Server component: reads the active tournament for the shell, then renders
 * the client-side PlayersPage component which fetches leaderboard data and
 * handles all interaction.
 */

import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import PublicShell from '@/components/layout/PublicShell';
import { PlayersPage } from '@/components/players/PlayersPage';

export const dynamic = 'force-dynamic';

export default async function PlayersRoute() {
  const tournament = await getActiveTournament(prisma);

  return (
    <PublicShell
      tournament={
        tournament ? { name: tournament.name, status: tournament.status } : null
      }
    >
      <PlayersPage />
    </PublicShell>
  );
}
