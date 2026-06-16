import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assertTournamentWritable } from './guards';

beforeEach(resetDb);

it('rejects writes on ARCHIVED tournament', async () => {
  const t = await testDb.tournament.create({ data: { name: 'X', kind: '正赛', config: {}, status: 'ARCHIVED', archivedAt: new Date() } });
  await expect(assertTournamentWritable(testDb, t.id)).rejects.toThrow('归档');
});

it('rejects when the tournament does not exist', async () => {
  await expect(assertTournamentWritable(testDb, 'missing-id')).rejects.toThrow('赛事不存在');
});

it('passes on active tournament', async () => {
  const t = await testDb.tournament.create({ data: { name: 'Y', kind: '正赛', config: {}, status: 'GROUP_STAGE' } });
  await expect(assertTournamentWritable(testDb, t.id)).resolves.toBeUndefined();
});
