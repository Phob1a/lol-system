import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { resetTournament } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../_lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    await resetTournament(db, { tournamentId: id, actorId: session!.user.id });
    publish({ type: 'tournament.reset', tournamentId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
