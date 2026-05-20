import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { resetDraft } from '@/lib/draft/engine';
import { getActiveSeason } from '@/lib/season/season-service';
import { prisma } from '@/lib/db';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '没有活跃赛季' }, { status: 409 });

  try {
    await resetDraft(season.id);
    publish({ type: 'draft.reset' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('reset draft failed', e);
    return NextResponse.json({ error: '重置失败' }, { status: 500 });
  }
}
