import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { commitImport } from '@/lib/tournament/import-service';
import { commitSchema } from '@/lib/tournament/import-schema';
import { toResponse } from '@/lib/tournament/route-errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  try {
    const body = commitSchema.parse(await req.json());
    const r = await commitImport(prisma, id, body, guard.session.user.id);
    return NextResponse.json({ ok: true, gameId: r.gameId });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
