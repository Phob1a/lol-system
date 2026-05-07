import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { ConfigPatch } from '@/lib/config-schema';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const config = await prisma.config.findUnique({ where: { id: 1 } });
  return NextResponse.json({ config });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const config = await prisma.config.findUnique({ where: { id: 1 } });
  if (config?.draftLocked) {
    return NextResponse.json({ error: '选秀已开启，无法修改配置' }, { status: 409 });
  }

  const json = await req.json().catch(() => null);
  const parsed = ConfigPatch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const updated = await prisma.config.update({
    where: { id: 1 },
    data: {
      ...(parsed.data.teamBudget !== undefined && { teamBudget: parsed.data.teamBudget }),
      ...(parsed.data.extras !== undefined && {
        extras: parsed.data.extras as Prisma.InputJsonValue,
      }),
    },
  });
  return NextResponse.json({ config: updated });
}
