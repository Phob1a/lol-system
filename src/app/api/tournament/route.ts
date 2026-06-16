import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { TournamentError } from '@/lib/tournament/errors';
import { CreateTournamentInput } from '@/lib/tournament/tournament-schema';
import { createTournament, listTournaments } from '@/lib/tournament/tournament-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const tournaments = await listTournaments(prisma);
  return NextResponse.json({ tournaments });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = CreateTournamentInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const tournament = await createTournament(prisma, parsed.data, guard.session.user.id);
    return NextResponse.json({ tournament }, { status: 201 });
  } catch (e) {
    if (e instanceof TournamentError) return toResponse(e);
    console.error('POST /api/tournament failed', e);
    return NextResponse.json({ error: '创建赛事失败' }, { status: 500 });
  }
}
