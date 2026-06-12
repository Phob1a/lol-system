import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { archiveActiveSeason, createSeason, getActiveSeason, listSeasons, transitionSeason, updateSeasonBudget } from './season-service';
import { SeasonError } from './errors';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

const T = { kind: '正赛', config: CFG_2x4x2 };

describe('season-service: create / get / list', () => {
  it('creates a season in SETUP', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    expect(s.status).toBe('SETUP');
    expect(s.name).toBe('S1');
  });

  it('getActiveSeason returns the single non-archived season', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    expect((await getActiveSeason(testDb))?.name).toBe('S1');
  });

  it('creating a second season archives the prior active one', async () => {
    const first = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    const second = await createSeason(testDb, { name: 'S2', teamBudget: 1000, tournament: T }, 'u');
    const reloadedFirst = await testDb.season.findUnique({ where: { id: first.id } });
    expect(reloadedFirst?.status).toBe('ARCHIVED');
    expect((await getActiveSeason(testDb))?.id).toBe(second.id);
  });

  it('listSeasons returns newest first', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await createSeason(testDb, { name: 'S2', teamBudget: 1000, tournament: T }, 'u');
    expect((await listSeasons(testDb)).map((s) => s.name)).toEqual(['S2', 'S1']);
  });
});

describe('season-service: transitions', () => {
  it('SETUP -> REGISTRATION is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });

  it('REGISTRATION -> DRAFTING is rejected (not adjacent)', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await expect(transitionSeason(testDb, s.id, 'DRAFTING')).rejects.toBeInstanceOf(SeasonError);
  });

  it('ROSTER_LOCKED -> REGISTRATION reopen is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });
});

describe('season-service: updateSeasonBudget', () => {
  it('updates the budget before the draft starts (REGISTRATION)', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    expect((await updateSeasonBudget(testDb, s.id, 1234.5)).teamBudget).toBe(1234.5);
  });

  it('rejects updates once the draft has started (DRAFTING)', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
    await transitionSeason(testDb, s.id, 'DRAFTING');
    await expect(updateSeasonBudget(testDb, s.id, 2000)).rejects.toBeInstanceOf(SeasonError);
    expect((await getActiveSeason(testDb))?.teamBudget).toBe(1000);
  });

  it('rejects an unknown season', async () => {
    await expect(updateSeasonBudget(testDb, 'nope', 500)).rejects.toBeInstanceOf(SeasonError);
  });
});
