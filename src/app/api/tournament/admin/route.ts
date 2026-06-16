import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { updateTournamentConfig } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

const patchSchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  config: z.object({}).passthrough().optional(),
});

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = patchSchema.parse(await req.json());
    await updateTournamentConfig(prisma, {
      tournamentId: body.tournamentId,
      name: body.name,
      kind: body.kind,
      config: body.config as GroupKnockoutConfig | undefined,
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
