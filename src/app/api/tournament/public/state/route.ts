// src/app/api/tournament/public/state/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getPublicTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ state: null });
  const state = await getPublicTournamentState(prisma, season.id);
  return NextResponse.json({ state });
}
