import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { renameTeam } from '@/lib/teams/team-service';

const Body = z.object({ name: z.string().trim().min(2, '队名至少 2 字').max(30, '队名过长') });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({ where: { id: params.id } });
  if (!team) return NextResponse.json({ error: '队伍不存在' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const isOwnTeam = session.user.role === 'CAPTAIN' && session.user.teamId === team.id;
  if (!isAdmin && !isOwnTeam) {
    return NextResponse.json({ error: '无权修改该队伍' }, { status: 403 });
  }

  await renameTeam(prisma, params.id, parsed.data.name);
  return NextResponse.json({ ok: true });
}
