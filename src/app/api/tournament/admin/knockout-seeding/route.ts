import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { confirmKnockoutSeeding, getKnockoutSeedingDraft } from '@/lib/tournament/knockout-seeding-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const knockoutSeedSlotSchema = z.object({
  matchId: z.string().min(1),
  slot: z.enum(['A', 'B']),
  teamId: z.string().min(1),
});

const confirmKnockoutSeedingSchema = z.object({
  tournamentId: z.string().min(1),
  slots: z.array(knockoutSeedSlotSchema),
});

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const tournamentId = new URL(req.url).searchParams.get('tournamentId');
  if (!tournamentId) return NextResponse.json({ error: '缺少 tournamentId' }, { status: 422 });

  try {
    const draft = await getKnockoutSeedingDraft(prisma, tournamentId);
    return NextResponse.json({ draft });
  } catch (e) {
    return toResponse(e);
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const body = confirmKnockoutSeedingSchema.parse(await req.json());
    await confirmKnockoutSeeding(prisma, {
      tournamentId: body.tournamentId,
      slots: body.slots,
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
