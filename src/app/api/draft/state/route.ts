import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { getActiveSeason } from '@/lib/season/season-service';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '没有活跃赛季' }, { status: 409 });

  const snapshot = await getDraftSnapshot(season.id);
  return NextResponse.json({ snapshot });
}
