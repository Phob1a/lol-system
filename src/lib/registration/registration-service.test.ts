import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createTournament, transitionTournament } from '@/lib/tournament/tournament-service';
import {
  submitPublicRegistration,
  adminCreateRegistration,
  deleteRegistration,
  listSeasonRegistrations,
  patchRegistration,
} from './registration-service';
import { RegistrationError } from './errors';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

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
  const tournament = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
  await transitionTournament(testDb, tournament.id, 'REGISTRATION');
  return tournament;
}

describe('submitPublicRegistration', () => {
  it('creates a Player master and a Registration', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    expect(reg.nickname).toBe('李哥');
    expect(await testDb.player.findUnique({ where: { gameId: 'faker' } })).not.toBeNull();
  });

  it('uses gameId as the nickname when public registration nickname is blank', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, { ...form, nickname: '   ' });
    const player = await testDb.player.findUnique({ where: { gameId: 'faker' } });

    expect(reg.nickname).toBe('faker');
    expect(player?.nickname).toBe('faker');
  });

  it('reuses the Player master across seasons', async () => {
    await openSeason();
    await submitPublicRegistration(testDb, form);
    const t2 = await createTournament(testDb, { name: 'S2', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    await transitionTournament(testDb, t2.id, 'REGISTRATION');
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
    await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u'); // stays SETUP
    await expect(submitPublicRegistration(testDb, form)).rejects.toBeInstanceOf(RegistrationError);
  });
});

describe('registration admin ops', () => {
  it('lists registrations for a season', async () => {
    const tournament = await openSeason();
    await submitPublicRegistration(testDb, form);
    expect(await listSeasonRegistrations(testDb, tournament.id)).toHaveLength(1);
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
    const tournament = await openSeason();
    const reg = await adminCreateRegistration(testDb, tournament.id, {
      gameId: 'walkin', nickname: '替补', primaryPositions: ['TOP'],
      secondaryPositions: [], currentRank: '钻石', peakRank: '大师',
      willingToCaptain: false, cost: 0,
    });
    expect(reg.nickname).toBe('替补');
    expect(await testDb.player.findUnique({ where: { gameId: 'walkin' } })).not.toBeNull();
  });

  it('uses gameId as the nickname when admin-created nickname is blank', async () => {
    const tournament = await openSeason();
    const reg = await adminCreateRegistration(testDb, tournament.id, {
      gameId: 'walkin', nickname: '', primaryPositions: ['TOP'],
      secondaryPositions: [], currentRank: '钻石', peakRank: '大师',
      willingToCaptain: false, cost: 0,
    });
    const player = await testDb.player.findUnique({ where: { gameId: 'walkin' } });

    expect(reg.nickname).toBe('walkin');
    expect(player?.nickname).toBe('walkin');
  });
});

describe('registration roster lock (P1.1)', () => {
  async function freezeSeason(tournamentId: string) {
    await transitionTournament(testDb, tournamentId, 'ROSTER_LOCKED');
    await transitionTournament(testDb, tournamentId, 'DRAFTING');
  }

  it('allows patch in ROSTER_LOCKED stage', async () => {
    const tournament = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await transitionTournament(testDb, tournament.id, 'ROSTER_LOCKED');
    const updated = await patchRegistration(testDb, reg.id, { cost: 100 });
    expect(updated.cost).toBe(100);
  });

  it('rejects patch once season reaches DRAFTING', async () => {
    const tournament = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await freezeSeason(tournament.id);
    await expect(
      patchRegistration(testDb, reg.id, { cost: 250 }),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'SEASON_LOCKED',
    });
  });

  it('rejects delete once season reaches DRAFTING', async () => {
    const tournament = await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await freezeSeason(tournament.id);
    await expect(
      deleteRegistration(testDb, reg.id),
    ).rejects.toMatchObject({
      name: 'RegistrationError',
      code: 'SEASON_LOCKED',
    });
    expect(await testDb.registration.count({ where: { id: reg.id } })).toBe(1);
  });

  it('rejects adminCreate once season reaches DRAFTING', async () => {
    const tournament = await openSeason();
    await submitPublicRegistration(testDb, form);
    await freezeSeason(tournament.id);
    await expect(
      adminCreateRegistration(testDb, tournament.id, {
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
