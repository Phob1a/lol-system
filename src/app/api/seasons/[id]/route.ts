import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { SeasonError } from '@/lib/season/errors';
import { UpdateSeasonInput } from '@/lib/season/season-schema';
import { updateSeasonBudget } from '@/lib/season/season-service';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = UpdateSeasonInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const season = await updateSeasonBudget(prisma, id, parsed.data.teamBudget);
    return NextResponse.json({ season });
  } catch (e) {
    if (e instanceof SeasonError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('PATCH /api/seasons/[id] failed', e);
    return NextResponse.json({ error: '更新赛季配置失败' }, { status: 500 });
  }
}
