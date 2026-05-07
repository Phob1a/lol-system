import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { PlayerInput } from '@/lib/players/schema';
import { upsertPlayer } from '@/lib/players/registration';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const players = await prisma.player.findMany({
    orderBy: [{ gameId: 'asc' }],
  });
  return NextResponse.json({ players });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  // Refuse changes once the draft is locked.
  const config = await prisma.config.findUnique({ where: { id: 1 } });
  if (config?.draftLocked) {
    return NextResponse.json(
      { error: '选秀已开启，无法修改名册' },
      { status: 409 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = PlayerInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const { player, created } = await upsertPlayer(parsed.data);
    return NextResponse.json({ player, created }, { status: created ? 201 : 200 });
  } catch (e) {
    console.error('POST /api/players failed', e);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}
