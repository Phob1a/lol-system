import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { parseUploadedFile, ImportParseError, MAX_ROWS } from '@/lib/import/parser';
import {
  checkHeaders,
  validateRow,
  dedupByGameId,
  type RowError,
  type RowOk,
} from '@/lib/import/validators';
import { upsertPlayer } from '@/lib/players/registration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const config = await prisma.config.findUnique({ where: { id: 1 } });
  if (config?.draftLocked) {
    return NextResponse.json({ error: '选秀已开启，无法修改名册' }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '未上传文件' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseUploadedFile(await file.arrayBuffer(), file.name);
  } catch (e) {
    if (e instanceof ImportParseError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error('parse error', e);
    return NextResponse.json({ error: '文件解析失败' }, { status: 400 });
  }

  const headerCheck = checkHeaders(parsed.rawHeaders);
  if (!headerCheck.ok) {
    return NextResponse.json(
      { error: `缺少必填列: ${headerCheck.missing.join(', ')}` },
      { status: 400 },
    );
  }

  const teamBudget = config?.teamBudget ?? 1000;
  const maxCost = teamBudget * 2; // generous cap; per planner, prevents typo'd astronomical values

  const oks: RowOk[] = [];
  const errs: RowError[] = [];
  parsed.rows.forEach((raw, i) => {
    const result = validateRow(i + 2, raw, { maxCost }); // +2: header is line 1, data starts at line 2
    if (result.ok) oks.push(result);
    else errs.push(result);
  });

  // Deduplicate within file (later wins).
  const dedup = dedupByGameId(oks);

  let inserted = 0;
  let updated = 0;
  const upsertErrors: RowError[] = [];

  // Run upserts sequentially so we can isolate errors per row without aborting the batch.
  for (const ok of dedup.rows) {
    try {
      const { created } = await upsertPlayer(ok.data);
      if (created) inserted += 1;
      else updated += 1;
    } catch (e) {
      console.error('upsert failed', ok.data.gameId, e);
      upsertErrors.push({
        row: ok.row,
        gameId: ok.data.gameId,
        errors: ['数据库写入失败'],
      });
    }
  }

  return NextResponse.json({
    totalRows: parsed.rows.length,
    inserted,
    updated,
    skipped: [...errs, ...upsertErrors],
    duplicates: dedup.duplicates,
    truncated: parsed.rows.length === MAX_ROWS,
  });
}
