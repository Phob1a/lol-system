import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { TournamentError } from '@/lib/tournament/errors';
import { UpdateBudgetInput } from '@/lib/tournament/tournament-schema';
import { updateTournamentBudget } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = UpdateBudgetInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const tournament = await updateTournamentBudget(prisma, id, parsed.data.teamBudget);
    return NextResponse.json({ tournament });
  } catch (e) {
    if (e instanceof TournamentError) return toResponse(e);
    console.error('PATCH /api/tournament/[id] failed', e);
    return NextResponse.json({ error: '更新赛事配置失败' }, { status: 500 });
  }
}
