import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireCaptain } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { reservationPatchSchema } from '@/lib/tournament/reservation-schema';
import { reserveMatch } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

export async function PATCH(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const guard = await requireCaptain();
  if (guard.error) return guard.error;
  const teamId = guard.session.user.teamId;
  if (!teamId) return NextResponse.json({ error: '队长未绑定队伍' }, { status: 403 });
  const { matchId } = await params;

  try {
    const body = reservationPatchSchema.parse(await req.json());
    await reserveMatch(prisma, {
      matchId,
      expectedVersion: body.expectedVersion,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      actorUserId: guard.session.user.id,
      actor: { role: 'CAPTAIN', teamId },
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: '参数错误', issues: err.issues }, { status: 422 });
    }
    return toResponse(err);
  }
}
