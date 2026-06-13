import { NextResponse } from 'next/server';
import { requireCaptain } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { listCaptainReservationState } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET() {
  const guard = await requireCaptain();
  if (guard.error) return guard.error;
  const teamId = guard.session.user.teamId;
  if (!teamId) return NextResponse.json({ error: '队长未绑定队伍' }, { status: 403 });

  try {
    const state = await listCaptainReservationState(prisma, { teamId });
    return NextResponse.json(state);
  } catch (err) {
    return toResponse(err);
  }
}
