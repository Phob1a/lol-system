import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getAdminTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const tournamentId = req.nextUrl.searchParams.get('tournamentId') ?? (await getActiveTournament(prisma))?.id ?? null;
  if (!tournamentId) return NextResponse.json({ state: null });
  const state = await getAdminTournamentState(prisma, tournamentId);
  return NextResponse.json({ state });
}
