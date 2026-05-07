import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rearrangeSlots, getDraftSnapshot, DraftStateError } from '@/lib/draft/engine';
import { POSITIONS } from '@/lib/players/schema';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

const Body = z.object({
  slots: z
    .array(
      z.object({
        position: z.enum(POSITIONS),
        playerId: z.string().nullable(),
      }),
    )
    .length(POSITIONS.length),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id: teamId } = await params;

  // Authorization: admin OR the captain who owns this team.
  if (session.user.role !== 'ADMIN') {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { captain: { select: { gameId: true } } },
    });
    if (!team) return NextResponse.json({ error: '战队不存在' }, { status: 404 });
    if (team.captain.gameId !== session.user.gameId) {
      return NextResponse.json({ error: '只能调整自己的战队' }, { status: 403 });
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const result = await rearrangeSlots(teamId, parsed.data.slots, session.user.id);
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ ...result, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('rearrangeSlots failed', e);
    return NextResponse.json({ error: '调整失败' }, { status: 500 });
  }
}
