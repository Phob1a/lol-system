import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requireAdmin } from '@/lib/api-guards';
import { revokePick, getDraftSnapshot, DraftStateError } from '@/lib/draft/engine';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();

  const { id } = await params;
  try {
    const result = await revokePick(id, session!.user.id);
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ ...result, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('revokePick failed', e);
    return NextResponse.json({ error: '撤销失败' }, { status: 500 });
  }
}
