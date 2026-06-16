import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { listPlayerTournamentProfiles } from '@/lib/tournament/player-stats-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ profiles: [] });
  const profiles = await listPlayerTournamentProfiles(prisma, tournament.id);
  return NextResponse.json({ profiles });
}
