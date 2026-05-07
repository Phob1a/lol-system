import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requireAdmin } from '@/lib/api-guards';
import { rewindRound, getDraftSnapshot, DraftStateError } from '@/lib/draft/engine';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();

  try {
    const result = await rewindRound(session!.user.id);
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ ...result, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('rewindRound failed', e);
    return NextResponse.json({ error: '回退失败' }, { status: 500 });
  }
}
