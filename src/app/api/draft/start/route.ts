import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requireAdmin } from '@/lib/api-guards';
import { startDraft, DraftStateError, getDraftSnapshot } from '@/lib/draft/engine';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();

  try {
    const { sessionId } = await startDraft(session!.user.id);
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ sessionId, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('start draft failed', e);
    return NextResponse.json({ error: '启动选秀失败' }, { status: 500 });
  }
}
