import { prisma } from '@/lib/db';
import { listTournamentRegistrations } from '@/lib/registration/registration-service';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { RegistrationsManager } from '@/components/admin/RegistrationsManager';
import { ArenaCta, ArenaEmptyState } from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="REGISTRY OFFLINE"
        title="请先创建赛事"
        description="赛事创建后，报名审核、队长任命和选手池维护会在这里开放。"
        action={<ArenaCta href="/admin/tournament">前往赛事管理</ArenaCta>}
      />
    );
  }
  const registrations = await listTournamentRegistrations(prisma, tournament.id);
  return <RegistrationsManager season={tournament} initialRegistrations={registrations} />;
}
