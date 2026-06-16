import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { discardImport } from '@/lib/tournament/import-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  try {
    await discardImport(prisma, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
