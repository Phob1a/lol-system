import { NextResponse } from 'next/server';
import { getDraftSnapshot } from '@/lib/draft/engine';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { seasonId: string } }) {
  try {
    const snapshot = await getDraftSnapshot(params.seasonId);
    return NextResponse.json({ snapshot });
  } catch (e) {
    console.error('GET /api/live state failed', e);
    return NextResponse.json({ error: '无法读取选秀状态' }, { status: 500 });
  }
}
