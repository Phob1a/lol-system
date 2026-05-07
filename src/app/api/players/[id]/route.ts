import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { PlayerPatch } from '@/lib/players/schema';
import { patchPlayer, deletePlayer } from '@/lib/players/registration';

async function ensureUnlocked() {
  const config = await prisma.config.findUnique({ where: { id: 1 } });
  if (config?.draftLocked) {
    return NextResponse.json(
      { error: '选秀已开启，无法修改名册' },
      { status: 409 },
    );
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const locked = await ensureUnlocked();
  if (locked) return locked;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PlayerPatch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const player = await patchPlayer(id, parsed.data);
    return NextResponse.json({ player });
  } catch (e) {
    if (e instanceof Error && e.message === 'PLAYER_NOT_FOUND') {
      return NextResponse.json({ error: '玩家不存在' }, { status: 404 });
    }
    console.error('PATCH /api/players/:id failed', e);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const locked = await ensureUnlocked();
  if (locked) return locked;

  const { id } = await params;
  try {
    await deletePlayer(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/players/:id failed', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
