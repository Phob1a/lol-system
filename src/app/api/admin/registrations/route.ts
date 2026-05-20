import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { AdminRegistrationCreate } from '@/lib/registration/registration-schema';
import {
  adminCreateRegistration,
  listSeasonRegistrations,
} from '@/lib/registration/registration-service';
import { getActiveSeason } from '@/lib/season/season-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ season: null, registrations: [] });
  const registrations = await listSeasonRegistrations(prisma, season.id);
  return NextResponse.json({ season, registrations });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '没有活跃赛季' }, { status: 409 });

  const json = await req.json().catch(() => null);
  const parsed = AdminRegistrationCreate.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await adminCreateRegistration(prisma, season.id, parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('POST /api/admin/registrations failed', e);
    return NextResponse.json({ error: '新增报名失败' }, { status: 500 });
  }
}
