import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getPlayerTournamentStats } from '@/lib/tournament/player-stats-service';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ error: '无活跃赛事' }, { status: 404 });
  const stats = await getPlayerTournamentStats(prisma, playerId, tournament.id);
  if (!stats) return NextResponse.json({ error: '选手不存在' }, { status: 404 });
  return NextResponse.json({ stats });
}
