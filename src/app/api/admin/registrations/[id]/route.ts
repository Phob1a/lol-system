import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { AdminRegistrationPatch } from '@/lib/registration/registration-schema';
import {
  deleteRegistration,
  patchRegistration,
} from '@/lib/registration/registration-service';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = AdminRegistrationPatch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await patchRegistration(prisma, id, parsed.data);
    return NextResponse.json({ registration });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 404 });
    }
    console.error('PATCH registration failed', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    await deleteRegistration(prisma, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE registration failed', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
