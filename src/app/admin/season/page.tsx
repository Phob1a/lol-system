import { prisma } from '@/lib/db';
import { listSeasons } from '@/lib/season/season-service';
import { SeasonManager } from '@/components/admin/SeasonManager';

export const dynamic = 'force-dynamic';

export default async function AdminSeasonPage() {
  const seasons = await listSeasons(prisma);
  return <SeasonManager initialSeasons={seasons} />;
}
