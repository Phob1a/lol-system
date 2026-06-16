import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { ingestImport } from './import-service';
import sample from '@/lib/test/fixtures/sample-summary.json';

beforeEach(resetDb);

it('ingest 建 PENDING 记录，externalGameId 以 string 返回', async () => {
  const r = await ingestImport(testDb, sample, 'SCRIPT');
  expect(typeof r.externalGameId).toBe('string');
  expect(r.duplicateOfCommitted).toBe(false);
  const row = await testDb.matchImport.findUnique({ where: { id: r.importId } });
  expect(row!.status).toBe('PENDING');
  expect(row!.source).toBe('SCRIPT');
  expect(row!.rawJson).toBeTruthy();
});
