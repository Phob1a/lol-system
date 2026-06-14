import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';

export async function POST(_req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return NextResponse.json(
    { error: '自动收小组入口已退役，请使用手动淘汰赛排位' },
    { status: 410 },
  );
}
