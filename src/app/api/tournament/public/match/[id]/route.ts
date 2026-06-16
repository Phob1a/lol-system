import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getPublicMatchDetail } from '@/lib/tournament/read-model';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPublicMatchDetail(prisma, id);
  if (!detail) return NextResponse.json({ error: '比赛不存在' }, { status: 404 });
  return NextResponse.json({ detail });
}
