import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { renameTeam } from '@/lib/teams/team-service';

const Body = z.object({ name: z.string().trim().min(2, '队名至少 2 字').max(30, '队名过长') });

// Admin-only escape hatch for renaming a team in any tournament stage.
// Captains must use PATCH /api/captain/team, which enforces the
// post-draft tournament status whitelist.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: '队伍不存在' }, { status: 404 });

  await renameTeam(prisma, id, parsed.data.name);
  return NextResponse.json({ ok: true });
}
