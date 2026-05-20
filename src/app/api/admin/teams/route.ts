import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { listSeasonTeams } from '@/lib/teams/team-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ teams: [] });
  const teams = await listSeasonTeams(prisma, season.id);
  return NextResponse.json({ teams });
}
