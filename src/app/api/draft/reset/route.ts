import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { resetDraft } from '@/lib/draft/engine';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    await resetDraft();
    publish({ type: 'draft.reset' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('reset draft failed', e);
    return NextResponse.json({ error: '重置失败' }, { status: 500 });
  }
}
