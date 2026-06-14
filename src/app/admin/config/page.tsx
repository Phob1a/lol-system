import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { SeasonConfig } from '@/components/admin/SeasonConfig';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const tournament = await getActiveTournament(prisma);
  return <SeasonConfig season={tournament} />;
}
