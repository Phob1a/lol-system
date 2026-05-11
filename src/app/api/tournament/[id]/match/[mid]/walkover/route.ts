import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { declareWalkover } from '@/lib/tournament/matches-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({
  winnerTeamId: z.string().min(1),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    const input = Body.parse(await req.json());
    await declareWalkover(db, {
      tournamentId: id, matchId: mid,
      winnerTeamId: input.winnerTeamId, note: input.note,
      actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
