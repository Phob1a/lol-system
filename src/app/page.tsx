import { PublicHomePage } from '@/components/home/PublicHomePage';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import type { HomeTournamentStatus, HomeSeasonStatus } from '@/lib/home/public-home';

export const dynamic = 'force-dynamic';

const HOME_TOURNAMENT_STATUSES: HomeTournamentStatus[] = ['SETUP', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'];

export default async function HomePage() {
  const tournament = await getActiveTournament(prisma);

  const homeTournamentStatus =
    tournament && HOME_TOURNAMENT_STATUSES.includes(tournament.status as HomeTournamentStatus)
      ? (tournament.status as HomeTournamentStatus)
      : null;

  return (
    <PublicHomePage
      context={{
        season: tournament ? { name: tournament.name, status: tournament.status as HomeSeasonStatus } : null,
        tournament: homeTournamentStatus ? { status: homeTournamentStatus } : null,
      }}
    />
  );
}
