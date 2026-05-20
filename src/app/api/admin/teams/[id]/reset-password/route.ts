import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { CaptainError } from '@/lib/captains/errors';
import { resetTeamPassword } from '@/lib/teams/team-service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const result = await resetTeamPassword(prisma, params.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 404 });
    }
    console.error('reset-password failed', e);
    return NextResponse.json({ error: '重置失败' }, { status: 500 });
  }
}
