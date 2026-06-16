import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tournament = await getActiveTournament(prisma);
  return NextResponse.json({
    open: tournament?.status === 'REGISTRATION',
    tournamentName: tournament?.name ?? null,
  });
}
