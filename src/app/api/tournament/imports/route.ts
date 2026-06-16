import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ingestImport, resolveImportAuth } from '@/lib/tournament/import-service';

export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const session = await getSession();
  const auth = resolveImportAuth(bearer, session?.user.role === 'ADMIN', process.env.MATCH_IMPORT_TOKEN);
  if ('error' in auth) return NextResponse.json({ error: '未授权' }, { status: 401 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 }); }
  try {
    const r = await ingestImport(prisma, raw, auth.source);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'summary 结构不合法' }, { status: 400 });
    throw e;
  }
}
