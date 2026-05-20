import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { appointCaptain } from '@/lib/captains/captain-service';
import { CaptainError } from '@/lib/captains/errors';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const result = await appointCaptain(prisma, params.id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('appoint-captain failed', e);
    return NextResponse.json({ error: '任命失败' }, { status: 500 });
  }
}
