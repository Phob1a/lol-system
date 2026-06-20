import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { listTournamentTeams } from '@/lib/teams/team-service';
import { TeamsManager } from '@/components/admin/TeamsManager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamsPage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    return (
      <p className="font-mono text-[11px] text-nexus-faint">请先创建赛事</p>
    );
  }
  const teams = await listTournamentTeams(prisma, tournament.id);
  return <TeamsManager season={tournament} initialTeams={teams} />;
}
