import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { revokeCaptain } from '@/lib/captains/captain-service';
import { CaptainError } from '@/lib/captains/errors';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    await revokeCaptain(prisma, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('revoke-captain failed', e);
    return NextResponse.json({ error: '撤销失败' }, { status: 500 });
  }
}
