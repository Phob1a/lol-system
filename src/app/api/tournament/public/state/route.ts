// src/app/api/tournament/public/state/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getPublicTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ state: null });
  const state = await getPublicTournamentState(prisma, tournament.id);
  return NextResponse.json({ state });
}
