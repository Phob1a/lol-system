import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { SeasonConfig } from '@/components/admin/SeasonConfig';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const season = await getActiveSeason(prisma);
  return <SeasonConfig season={season} />;
}
