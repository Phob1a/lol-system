import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignTeam } from '@/lib/tournament/groups-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../_lib/route-helpers';

export const runtime = 'nodejs';

const Body = z.object({
  teamId: z.string().min(1),
  groupLetter: z.string().min(1).max(2),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    await assignTeam(db, { tournamentId: id, ...input, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
