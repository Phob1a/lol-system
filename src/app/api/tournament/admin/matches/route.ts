import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { addCustomMatch } from '@/lib/tournament/schedule-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const addMatchSchema = z.object({
  tournamentId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  bestOf: z.number().int().positive(),
  label: z.string().min(1),
  countsForStandings: z.boolean(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = addMatchSchema.parse(await req.json());
    await addCustomMatch(prisma, {
      ...body,
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
