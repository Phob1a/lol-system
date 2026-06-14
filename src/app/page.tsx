import { PublicHomePage } from '@/components/home/PublicHomePage';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import type { HomeBracketStatus, HomeTournamentStatus } from '@/lib/home/public-home';

export const dynamic = 'force-dynamic';

const HOME_BRACKET_STATUSES: HomeBracketStatus[] = ['SETUP', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'];

export default async function HomePage() {
  const tournament = await getActiveTournament(prisma);

  const homeBracketStatus =
    tournament && HOME_BRACKET_STATUSES.includes(tournament.status as HomeBracketStatus)
      ? (tournament.status as HomeBracketStatus)
      : null;

  return (
    <PublicHomePage
      context={{
        tournament: tournament ? { name: tournament.name, status: tournament.status as HomeTournamentStatus } : null,
        bracket: homeBracketStatus ? { status: homeBracketStatus } : null,
      }}
    />
  );
}
