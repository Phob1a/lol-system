import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { listTournamentTeams } from '@/lib/teams/team-service';
import { TeamsManager } from '@/components/admin/TeamsManager';
import { ArenaCta, ArenaEmptyState } from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function AdminTeamsPage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="TEAM GRID OFFLINE"
        title="请先创建赛事"
        description="任命队长并生成队伍后，这里会管理队伍账号、预算和凭证。"
        action={<ArenaCta href="/admin/tournament">前往赛事管理</ArenaCta>}
      />
    );
  }
  const teams = await listTournamentTeams(prisma, tournament.id);
  return <TeamsManager season={tournament} initialTeams={teams} />;
}
