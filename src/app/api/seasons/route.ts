import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { CreateSeasonInput } from '@/lib/season/season-schema';
import { createSeason, listSeasons } from '@/lib/season/season-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const seasons = await listSeasons(prisma);
  return NextResponse.json({ seasons });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = CreateSeasonInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const season = await createSeason(prisma, parsed.data);
    return NextResponse.json({ season }, { status: 201 });
  } catch (e) {
    console.error('POST /api/seasons failed', e);
    return NextResponse.json({ error: '创建赛季失败' }, { status: 500 });
  }
}
