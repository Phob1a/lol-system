import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import {
  submitPublicRegistration,
  adminCreateRegistration,
  deleteRegistration,
  listSeasonRegistrations,
  patchRegistration,
} from './registration-service';
import { RegistrationError } from './errors';

const form = {
  gameId: 'faker',
  nickname: '李哥',
  primaryPositions: ['MID' as const],
  secondaryPositions: [],
  currentRank: '大师',
  peakRank: '宗师',
  willingToCaptain: true,
};

async function openSeason() {
  const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
  await transitionSeason(testDb, s.id, 'REGISTRATION');
  return s;
}

describe('submitPublicRegistration', () => {
  it('creates a Player master and a Registration', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    expect(reg.nickname).toBe('李哥');
    expect(await testDb.player.findUnique({ where: { gameId: 'faker' } })).not.toBeNull();
  });

  it('reuses the Player master across seasons', async () => {
    await openSeason();
    await submitPublicRegistration(testDb, form);
    const s2 = await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    await transitionSeason(testDb, s2.id, 'REGISTRATION');
    await submitPublicRegistration(testDb, form);
    expect(await testDb.player.count()).toBe(1);
    expect(await testDb.registration.count()).toBe(2);
  });

  it('rejects a duplicate gameId in the same season', async () => {
    await openSeason();
    await submitPublicRegistration(testDb, form);
    await expect(submitPublicRegistration(testDb, form)).rejects.toBeInstanceOf(RegistrationError);
  });

  it('rejects when no season is open for registration', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 }); // stays SETUP
    await expect(submitPublicRegistration(testDb, form)).rejects.toBeInstanceOf(RegistrationError);
  });
});

describe('registration admin ops', () => {
  it('lists registrations for a season', async () => {
    const s = await openSeason();
    await submitPublicRegistration(testDb, form);
    expect(await listSeasonRegistrations(testDb, s.id)).toHaveLength(1);
  });

  it('patches cost and status', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    const updated = await patchRegistration(testDb, reg.id, { cost: 250, status: 'EXCLUDED' });
    expect(updated.cost).toBe(250);
    expect(updated.status).toBe('EXCLUDED');
  });

  it('deletes a registration', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await deleteRegistration(testDb, reg.id);
    expect(await testDb.registration.count()).toBe(0);
  });

  it('admin-creates a registration for a season', async () => {
    const s = await openSeason();
    const reg = await adminCreateRegistration(testDb, s.id, {
      gameId: 'walkin', nickname: '替补', primaryPositions: ['TOP'],
      secondaryPositions: [], currentRank: '钻石', peakRank: '大师',
      willingToCaptain: false, cost: 0,
    });
    expect(reg.nickname).toBe('替补');
    expect(await testDb.player.findUnique({ where: { gameId: 'walkin' } })).not.toBeNull();
  });
});

describe('registration roster lock (P1.1)', () => {
  async function freezeSeason(seasonId: string) {
    await transitionSeason(testDb, seasonId, 'ROSTER_LOCKED');
    await transitionSeason(testDb, seasonId, 'DRAFTING');
  }

  it('allows patch in ROSTER_LOCKED stage', async () => {
    const s = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
    const updated = await patchRegistration(testDb, reg.id, { cost: 100 });
    expect(updated.cost).toBe(100);
  });

  it('rejects patch once season reaches DRAFTING', async () => {
    const s = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await freezeSeason(s.id);
    await expect(
      patchRegistration(testDb, reg.id, { cost: 250 }),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'SEASON_LOCKED',
    });
  });

  it('rejects delete once season reaches DRAFTING', async () => {
    const s = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await freezeSeason(s.id);
    await expect(
      deleteRegistration(testDb, reg.id),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'SEASON_LOCKED',
    });
    expect(await testDb.registration.count({ where: { id: reg.id } })).toBe(1);
  });

  it('rejects adminCreate once season reaches DRAFTING', async () => {
    const s = await openSeason();
    await submitPublicRegistration(testDb, form);
    await freezeSeason(s.id);
    await expect(
      adminCreateRegistration(testDb, s.id, {
        gameId: 'late', nickname: '迟到', primaryPositions: ['ADC'],
        secondaryPositions: [], currentRank: '黄金', peakRank: '铂金',
        willingToCaptain: false, cost: 0,
      }),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'SEASON_LOCKED',
    });
  });

  it('adminCreate rejects when seasonId not found', async () => {
    await expect(
      adminCreateRegistration(testDb, 'cl_nonexistent', {
        gameId: 'ghost', nickname: '幽灵', primaryPositions: ['TOP'],
        secondaryPositions: [], currentRank: '黄金', peakRank: '铂金',
        willingToCaptain: false, cost: 0,
      }),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'NOT_FOUND',
    });
  });
});
