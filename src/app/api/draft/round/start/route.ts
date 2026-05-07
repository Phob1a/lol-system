import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { requireAdmin } from '@/lib/api-guards';
import { startRound, getDraftSnapshot, DraftStateError } from '@/lib/draft/engine';
import { POSITIONS } from '@/lib/players/schema';
import { publish } from '@/server/draft-bus';

export const runtime = 'nodejs';

const Body = z.object({
  mode: z.enum(['MANUAL', 'ADMIN_ORDER', 'REVERSE_LAST', 'BUDGET_DESC']),
  adminProvidedOrder: z.array(z.string().min(1)).optional(),
  manualAssignments: z
    .array(
      z.object({
        captainId: z.string().min(1),
        playerId: z.string().min(1),
        position: z.enum(POSITIONS),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const result = await startRound({
      mode: parsed.data.mode,
      adminProvidedOrder: parsed.data.adminProvidedOrder,
      manualAssignments: parsed.data.manualAssignments,
      actorUserId: session!.user.id,
    });
    const snapshot = await getDraftSnapshot();
    publish({ type: 'state.invalidated', seq: snapshot.seq });
    return NextResponse.json({ ...result, snapshot });
  } catch (e) {
    if (e instanceof DraftStateError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('startRound failed', e);
    return NextResponse.json({ error: '启动轮次失败' }, { status: 500 });
  }
}
