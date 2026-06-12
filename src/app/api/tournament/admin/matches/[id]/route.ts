// src/app/api/tournament/admin/matches/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { cancelMatch, deleteGame, recordGame, rescheduleMatch } from '@/lib/tournament/score-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const patchSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reschedule'), expectedVersion: z.number().int(), scheduledAt: z.string().datetime().nullable() }),
  z.object({ op: z.literal('cancel'), expectedVersion: z.number().int() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = patchSchema.parse(await req.json());
    if (body.op === 'reschedule') {
      await rescheduleMatch(prisma, {
        matchId: id, expectedVersion: body.expectedVersion,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        actorUserId: guard.session.user.id,
      });
    } else {
      await cancelMatch(prisma, { matchId: id, expectedVersion: body.expectedVersion, actorUserId: guard.session.user.id });
    }
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const recordSchema = z.object({ expectedVersion: z.number().int(), winnerTeamId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = recordSchema.parse(await req.json());
    await recordGame(prisma, { matchId: id, ...body, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

const deleteSchema = z.object({ expectedVersion: z.number().int(), gameId: z.string().min(1) });

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = deleteSchema.parse(await req.json());
    await deleteGame(prisma, { matchId: id, ...body, actorUserId: guard.session.user.id });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
