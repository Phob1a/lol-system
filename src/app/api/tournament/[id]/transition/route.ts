import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { TournamentError } from '@/lib/tournament/errors';
import { transitionTournament } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';
import type { TournamentStatus } from '@prisma/client';

const Body = z.object({
  next: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  try {
    const tournament = await transitionTournament(prisma, id, parsed.data.next as TournamentStatus);
    return NextResponse.json({ tournament });
  } catch (e) {
    if (e instanceof TournamentError) return toResponse(e);
    console.error('tournament transition failed', e);
    return NextResponse.json({ error: '状态变更失败' }, { status: 500 });
  }
}
