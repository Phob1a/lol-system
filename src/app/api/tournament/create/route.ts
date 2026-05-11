import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { createTournament } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../_lib/route-helpers';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  groupCount: z.number().int().min(1).max(8),
  teamsPerGroup: z.number().int().min(2).max(16),
  advancingPerGroup: z.number().int().min(1).max(8),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const input = Body.parse(await req.json());
    const t = await createTournament(db, { ...input, actorId: session!.user.id });
    publish({ type: 'state.invalidated', tournamentId: t.id, seq: t.seq });
    return NextResponse.json({ tournament: t });
  } catch (e) {
    return mapError(e);
  }
}
