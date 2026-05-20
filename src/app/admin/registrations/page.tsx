import { prisma } from '@/lib/db';
import { listSeasonRegistrations } from '@/lib/registration/registration-service';
import { getActiveSeason } from '@/lib/season/season-service';
import { RegistrationsManager } from '@/components/admin/RegistrationsManager';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;
  const registrations = await listSeasonRegistrations(prisma, season.id);
  return <RegistrationsManager season={season} initialRegistrations={registrations} />;
}
