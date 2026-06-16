import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { ingestImport } from './import-service';
import {
  discardImport,
  getImportDetail,
  listImports,
  serializeImport,
} from './import-service';
import sample from '@/lib/test/fixtures/sample-summary.json';

beforeEach(resetDb);

// ——— serializeImport (unit, no DB) ———

describe('serializeImport', () => {
  it('converts BigInt fields to strings', () => {
    const row = {
      id: 'abc',
      externalGameId: BigInt('7391234567890123456'),
      gameCreation: BigInt('1700000000000'),
      status: 'PENDING',
    };
    const result = serializeImport(row);
    expect(result.externalGameId).toBe('7391234567890123456');
    expect(result.gameCreation).toBe('1700000000000');
    expect(result.id).toBe('abc');
    expect(result.status).toBe('PENDING');
  });

  it('handles null gameCreation', () => {
    const row = {
      id: 'abc',
      externalGameId: BigInt(12345),
      gameCreation: null,
      status: 'PENDING',
    };
    const result = serializeImport(row);
    expect(result.externalGameId).toBe('12345');
    expect(result.gameCreation).toBeNull();
  });
});

// ——— listImports (DB-backed) ———

describe('listImports', () => {
  it('returns PENDING rows after ingestImport, externalGameId as string', async () => {
    await ingestImport(testDb, sample, 'SCRIPT');
    const rows = await listImports(testDb);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].externalGameId).toBe('string');
    expect(rows[0].status).toBe('PENDING');
  });

  it('filters by status — PENDING filter returns only PENDING', async () => {
    await ingestImport(testDb, sample, 'SCRIPT');
    const pending = await listImports(testDb, 'PENDING');
    expect(pending).toHaveLength(1);
    const committed = await listImports(testDb, 'COMMITTED');
    expect(committed).toHaveLength(0);
  });

  it('returns empty array when no imports exist', async () => {
    const rows = await listImports(testDb);
    expect(rows).toHaveLength(0);
  });
});

// ——— getImportDetail (DB-backed) ———

describe('getImportDetail', () => {
  it('returns row with externalGameId as string when found', async () => {
    const { importId } = await ingestImport(testDb, sample, 'SCRIPT');
    const detail = await getImportDetail(testDb, importId);
    expect(detail).not.toBeNull();
    expect(typeof detail!.externalGameId).toBe('string');
  });

  it('returns null when not found', async () => {
    const detail = await getImportDetail(testDb, 'nonexistent-id');
    expect(detail).toBeNull();
  });
});

// ——— discardImport (DB-backed) ———

describe('discardImport', () => {
  it('flips PENDING → DISCARDED', async () => {
    const { importId } = await ingestImport(testDb, sample, 'SCRIPT');
    await discardImport(testDb, importId);
    const row = await testDb.matchImport.findUnique({ where: { id: importId } });
    expect(row!.status).toBe('DISCARDED');
  });

  it('calling on a DISCARDED row throws TournamentError VALIDATION', async () => {
    const { importId } = await ingestImport(testDb, sample, 'SCRIPT');
    await discardImport(testDb, importId);
    await expect(discardImport(testDb, importId)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('throws TournamentError VALIDATION for non-existent id (findUniqueOrThrow)', async () => {
    await expect(discardImport(testDb, 'no-such-id')).rejects.toThrow();
  });
});
