import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { SeasonError } from '@/lib/season/errors';
import { transitionSeason } from '@/lib/season/season-service';

const Body = z.object({
  to: z.enum(['REGISTRATION', 'ROSTER_LOCKED']),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  try {
    const season = await transitionSeason(prisma, params.id, parsed.data.to);
    return NextResponse.json({ season });
  } catch (e) {
    if (e instanceof SeasonError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('season transition failed', e);
    return NextResponse.json({ error: '状态变更失败' }, { status: 500 });
  }
}
