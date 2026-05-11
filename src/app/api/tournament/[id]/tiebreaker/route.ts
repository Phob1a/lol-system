import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { createTiebreaker } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({ teamAId: z.string().min(1), teamBId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    await createTiebreaker(db, { tournamentId: id, ...input, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
