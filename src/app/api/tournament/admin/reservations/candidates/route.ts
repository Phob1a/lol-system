import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { adminReservationCandidatesQuerySchema } from '@/lib/tournament/reservation-schema';
import { listReservableMatches } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const url = new URL(req.url);
    const query = adminReservationCandidatesQuerySchema.parse({
      tournamentId: url.searchParams.get('tournamentId'),
    });
    const matches = await listReservableMatches(prisma, {
      tournamentId: query.tournamentId,
      actor: { role: 'ADMIN' },
    });
    return NextResponse.json({ matches });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: '参数错误', issues: err.issues }, { status: 422 });
    }
    return toResponse(err);
  }
}
