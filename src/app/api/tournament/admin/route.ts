import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { createTournamentShell } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

const createSchema = z.object({
  seasonId: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().optional(),
  teamIds: z.array(z.string().min(1)),
  config: z.object({}).passthrough(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = createSchema.parse(await req.json());
    // Task 8 will wire teamIds into season-scoped snapshot; for now shell-only (teamIds accepted but unused)
    await prisma.$transaction((tx) =>
      createTournamentShell(tx, {
        seasonId: body.seasonId,
        name: body.name,
        kind: body.kind ?? '正赛',
        config: body.config as GroupKnockoutConfig,
        actorUserId: guard.session.user.id,
      }),
    );
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}

