import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const events = await db.tournamentEvent.findMany({
    where: { tournamentId: id },
    orderBy: { seq: 'desc' },
    take: limit,
  });
  return NextResponse.json({ events });
}
