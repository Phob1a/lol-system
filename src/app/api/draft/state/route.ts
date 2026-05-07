import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDraftSnapshot } from '@/lib/draft/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const snapshot = await getDraftSnapshot();
  return NextResponse.json({ snapshot });
}
