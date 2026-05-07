import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { submitPick, getDraftSnapshot, DraftStateError } from '@/lib/draft/engine';
import { POSITIONS } from '@/lib/players/schema';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

const Body = z.object({
  playerId: z.string().min(1),
  position: z.enum(POSITIONS),
  expectedSeq: z.number().int(),
  /** Admin-only: proxy-pick on behalf of this captainId (= Player.id of the captain). */
  onBehalfOf: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  // Resolve byCaptainId based on role.
  let byCaptainId: string;
  if (parsed.data.onBehalfOf) {
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '仅管理员可代选' }, { status: 403 });
    }
    byCaptainId = parsed.data.onBehalfOf;
  } else {
    if (session.user.role !== 'CAPTAIN' || !session.user.isCaptain) {
      return NextResponse.json(
        { error: '非队长无法直接出手；管理员请使用 onBehalfOf' },
        { status: 403 },
      );
    }
    // Look up captain's Player.id from their User record.
    const player = await prisma.player.findFirst({
      where: { user: { id: session.user.id } },
      select: { id: true },
    });
    if (!player) return NextResponse.json({ error: '账户未关联选手' }, { status: 404 });
    byCaptainId = player.id;
  }

  try {
    const result = await submitPick({
      byCaptainId,
      playerId: parsed.data.playerId,
      position: parsed.data.position,
      expectedSeq: parsed.data.expectedSeq,
      actorUserId: session.user.id,
    });
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ ...result, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        // STALE_SEQ → 409 explicitly so client refetches; others are also 409 in spirit (state conflict).
        { status: 409 },
      );
    }
    console.error('submitPick failed', e);
    return NextResponse.json({ error: '出手失败' }, { status: 500 });
  }
}
