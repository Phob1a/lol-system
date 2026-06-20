/**
 * /tournament/team/[teamId] — 战队主页 (Screen 6).
 *
 * Server component: loads team data via team-page-service and passes it to
 * the client-side <TeamPage> component.
 *
 * This route resolves the team-name links already present in GroupStandings
 * (href="/tournament/team/${row.teamId}").
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getTeamPageData } from '@/lib/tournament/team-page-service';
import { TeamPage } from '@/components/tournament/TeamPage';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ teamId: string }>;
}

export default async function TeamPageRoute({ params }: Props) {
  const { teamId } = await params;

  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    notFound();
  }

  const data = await getTeamPageData(prisma, teamId, tournament.id);
  if (!data) {
    notFound();
  }

  return <TeamPage data={data} />;
}
