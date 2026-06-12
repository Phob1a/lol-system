import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getPlayerSeasonStats } from '@/lib/tournament/player-stats-service';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '无活跃赛季' }, { status: 404 });
  const stats = await getPlayerSeasonStats(prisma, playerId, season.id);
  if (!stats) return NextResponse.json({ error: '选手不存在' }, { status: 404 });
  return NextResponse.json({ stats });
}
