import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { listSeasonTeams } from '@/lib/teams/team-service';
import { TournamentAdmin } from '@/components/admin/tournament/TournamentAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentPage() {
  const season = await getActiveSeason(prisma);
  if (!season) {
    return (
      <div className="text-muted-foreground">尚无活跃赛季，请先前往赛季管理创建赛季。</div>
    );
  }
  const teams = await listSeasonTeams(prisma, season.id);
  const teamList = teams.map((t) => ({ id: t.id, name: t.name }));
  return <TournamentAdmin seasonId={season.id} teams={teamList} />;
}
