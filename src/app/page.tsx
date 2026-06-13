import { PublicHomePage } from '@/components/home/PublicHomePage';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const season = await getActiveSeason(prisma);
  const tournament = season
    ? await prisma.tournament.findUnique({
        where: { seasonId: season.id },
        select: { status: true },
      })
    : null;

  return (
    <PublicHomePage
      context={{
        season: season ? { name: season.name, status: season.status } : null,
        tournament: tournament ? { status: tournament.status } : null,
      }}
    />
  );
}
