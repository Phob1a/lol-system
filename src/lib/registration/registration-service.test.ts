import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import { submitPublicRegistration } from './registration-service';
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
