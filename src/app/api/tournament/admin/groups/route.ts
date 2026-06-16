import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { assignGroups, confirmGroups } from '@/lib/tournament/groups-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const assignSchema = z.object({
  tournamentId: z.string().min(1),
  assignments: z.array(
    z.object({
      groupId: z.string().min(1),
      teamIds: z.array(z.string().min(1)),
    }),
  ),
});

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = assignSchema.parse(await req.json());
    await assignGroups(prisma, { ...body, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const confirmSchema = z.object({
  tournamentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = confirmSchema.parse(await req.json());
    await confirmGroups(prisma, { tournamentId: body.tournamentId, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
