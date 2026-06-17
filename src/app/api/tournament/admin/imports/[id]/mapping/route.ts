import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { buildAutoMapping, buildMapping, getImportDetail } from '@/lib/tournament/import-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const matchId = req.nextUrl.searchParams.get('matchId');
  const blueTeamId = req.nextUrl.searchParams.get('blueTeamId');
  if (!matchId) {
    return NextResponse.json({ error: 'matchId 为必填参数' }, { status: 400 });
  }

  try {
    const importRow = await getImportDetail(prisma, id);
    if (!importRow) return NextResponse.json({ error: '导入不存在' }, { status: 404 });
    const m = blueTeamId
      ? await buildMapping(prisma, matchId, blueTeamId, importRow.rawJson)
      : await buildAutoMapping(prisma, matchId, importRow.rawJson);
    return NextResponse.json(m);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    // buildMapping throws plain Error for bad blueTeamId — return 400
    if (e instanceof Error && !(e as { code?: string }).code) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return toResponse(e);
  }
}
