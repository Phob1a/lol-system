import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { listImports } from '@/lib/tournament/import-service';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const statusParam = req.nextUrl.searchParams.get('status');
  if (statusParam !== null && !['PENDING', 'COMMITTED', 'DISCARDED'].includes(statusParam)) {
    return NextResponse.json({ error: '参数错误' }, { status: 422 });
  }
  const status = statusParam as 'PENDING' | 'COMMITTED' | 'DISCARDED' | null;

  const imports = await listImports(prisma, status ?? undefined);
  return NextResponse.json({ imports });
}
