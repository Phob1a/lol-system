import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { listSeasonTeams } from '@/lib/teams/team-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ teams: [] });
  const teams = await listSeasonTeams(prisma, tournament.id);
  return NextResponse.json({ teams });
}
