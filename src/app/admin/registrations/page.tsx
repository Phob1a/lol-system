import { prisma } from '@/lib/db';
import { listSeasonRegistrations } from '@/lib/registration/registration-service';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { RegistrationsManager } from '@/components/admin/RegistrationsManager';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return <div className="text-muted-foreground">请先创建赛事</div>;
  const registrations = await listSeasonRegistrations(prisma, tournament.id);
  return <RegistrationsManager season={tournament} initialRegistrations={registrations} />;
}
