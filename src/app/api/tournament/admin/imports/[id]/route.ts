import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getImportDetail } from '@/lib/tournament/import-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const r = await getImportDetail(prisma, id);
  if (!r) return NextResponse.json({ error: '导入不存在' }, { status: 404 });
  return NextResponse.json({ import: r });
}
