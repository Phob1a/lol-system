import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { listSeasonTeams } from '@/lib/teams/team-service';
import { TeamsManager } from '@/components/admin/TeamsManager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamsPage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;
  const teams = await listSeasonTeams(prisma, season.id);
  return <TeamsManager season={season} initialTeams={teams} />;
}
