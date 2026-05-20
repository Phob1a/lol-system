import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { archiveActiveSeason, createSeason, getActiveSeason, listSeasons, transitionSeason } from './season-service';
import { SeasonError } from './errors';

describe('season-service: create / get / list', () => {
  it('creates a season in SETUP', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect(s.status).toBe('SETUP');
    expect(s.name).toBe('S1');
  });

  it('getActiveSeason returns the single non-archived season', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect((await getActiveSeason(testDb))?.name).toBe('S1');
  });

  it('creating a second season archives the prior active one', async () => {
    const first = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    const second = await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    const reloadedFirst = await testDb.season.findUnique({ where: { id: first.id } });
    expect(reloadedFirst?.status).toBe('ARCHIVED');
    expect((await getActiveSeason(testDb))?.id).toBe(second.id);
  });

  it('listSeasons returns newest first', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    expect((await listSeasons(testDb)).map((s) => s.name)).toEqual(['S2', 'S1']);
  });
});

describe('season-service: transitions', () => {
  it('SETUP -> REGISTRATION is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });

  it('REGISTRATION -> DRAFTING is rejected (not adjacent)', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await expect(transitionSeason(testDb, s.id, 'DRAFTING')).rejects.toBeInstanceOf(SeasonError);
  });

  it('ROSTER_LOCKED -> REGISTRATION reopen is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });
});
