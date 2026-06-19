import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getPlayerTournamentStats } from '@/lib/tournament/player-stats-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ error: '无活跃赛事' }, { status: 404 });
  // 公开页默认不下发原始 extStats（避免暴露未来导入字段、减小 payload）；仅 ?debug=1 时返回。
  const includeRawStats = req.nextUrl.searchParams.get('debug') === '1';
  const stats = await getPlayerTournamentStats(prisma, playerId, tournament.id, { includeRawStats });
  if (!stats) return NextResponse.json({ error: '选手不存在' }, { status: 404 });
  return NextResponse.json({ stats });
}
