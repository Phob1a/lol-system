// src/app/api/tournament/admin/schedule/batch/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rescheduleMatches } from '@/lib/tournament/score-service';
import { scheduleBatchSchema } from '@/lib/tournament/schedule-batch-schema';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = scheduleBatchSchema.parse(await req.json());
    await rescheduleMatches(prisma, {
      items: body.items.map((i) => ({
        matchId: i.matchId,
        expectedVersion: i.expectedVersion,
        scheduledAt: i.scheduledAt ? new Date(i.scheduledAt) : null,
      })),
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
