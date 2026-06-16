import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ error: '没有活跃赛事' }, { status: 409 });

  const snapshot = await getDraftSnapshot(tournament.id);
  return NextResponse.json({ snapshot });
}
