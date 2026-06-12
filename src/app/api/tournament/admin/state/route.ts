import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getAdminTournamentState } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const seasonId = req.nextUrl.searchParams.get('seasonId') ?? (await getActiveSeason(prisma))?.id ?? null;
  if (!seasonId) return NextResponse.json({ state: null });
  const state = await getAdminTournamentState(prisma, seasonId);
  return NextResponse.json({ state });
}
