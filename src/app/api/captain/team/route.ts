import { NextResponse } from 'next/server';
import { requireCaptain } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { UpdateTeamProfileInput } from '@/lib/teams/team-schema';
import { updateTeamProfile } from '@/lib/teams/team-service';

export async function PATCH(req: Request) {
  const guard = await requireCaptain();
  if (guard.error) return guard.error;

  const teamId = guard.session.user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: '需要队长账号' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateTeamProfileInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const season = await getActiveSeason(prisma);
  if (!season || season.status !== 'COMPLETED') {
    return NextResponse.json({ error: '选秀尚未结束' }, { status: 409 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.seasonId !== season.id) {
    return NextResponse.json({ error: '无权操作该队伍' }, { status: 403 });
  }

  try {
    await updateTeamProfile(prisma, teamId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/captain/team failed', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
