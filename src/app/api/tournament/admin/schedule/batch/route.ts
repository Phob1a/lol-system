import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  return NextResponse.json(
    { error: '批量排期已退役，请使用单场比赛预约', code: 'BATCH_SCHEDULE_RETIRED' },
    { status: 410 },
  );
}
