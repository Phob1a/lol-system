import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requireAdmin } from '@/lib/api-guards';
import { startDraft, DraftStateError, getDraftSnapshot } from '@/lib/draft/engine';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { prisma } from '@/lib/db';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();

  const tournament = await getActiveTournament(prisma);
  if (!tournament) return NextResponse.json({ error: '没有活跃赛事' }, { status: 409 });

  try {
    const { sessionId } = await startDraft(tournament.id, session!.user.id);
    const snapshot = await getDraftSnapshot(tournament.id);
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ sessionId, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      if (e.code === 'WRONG_TOURNAMENT_STATE') {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
      }
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('start draft failed', e);
    return NextResponse.json({ error: '启动选秀失败' }, { status: 500 });
  }
}
