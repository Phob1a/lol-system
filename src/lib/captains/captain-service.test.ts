import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createTournament, transitionTournament } from '@/lib/tournament/tournament-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { appointCaptain, revokeCaptain } from './captain-service';
import { CaptainError } from './errors';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

async function seasonWithReg(gameId = 'cap1') {
  const tournament = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
  await transitionTournament(testDb, tournament.id, 'REGISTRATION');
  const reg = await submitPublicRegistration(testDb, {
    gameId, nickname: '队长甲', primaryPositions: ['MID'],
    secondaryPositions: [], currentRank: '大师', peakRank: '大师', willingToCaptain: true,
    availability: '工作日晚',
  });
  await transitionTournament(testDb, tournament.id, 'ROSTER_LOCKED');
  return { tournament, reg };
}

describe('appointCaptain', () => {
  it('creates a Team and a team account, returns plaintext credentials', async () => {
    const { reg } = await seasonWithReg();
    const result = await appointCaptain(testDb, reg.id);
    expect(result.username).toMatch(/^TEAM-/);
    expect(result.password).toHaveLength(10);
    const team = await testDb.team.findUnique({ where: { captainId: reg.id } });
    expect(team).not.toBeNull();
    const account = await testDb.user.findUnique({ where: { id: team!.userId } });
    expect(account!.role).toBe('CAPTAIN');
    expect((await testDb.registration.findUnique({ where: { id: reg.id } }))!.isCaptain).toBe(true);
  });

  it('rejects appointing when the season is not ROSTER_LOCKED', async () => {
    const tournament = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    await transitionTournament(testDb, tournament.id, 'REGISTRATION');
    const reg = await submitPublicRegistration(testDb, {
      gameId: 'c', nickname: 'c', primaryPositions: ['TOP'], secondaryPositions: [],
      currentRank: '大师', peakRank: '大师', willingToCaptain: true,
      availability: '工作日晚',
    });
    await expect(appointCaptain(testDb, reg.id)).rejects.toBeInstanceOf(CaptainError);
  });

  it('revokeCaptain deletes the team and account', async () => {
    const { reg } = await seasonWithReg();
    await appointCaptain(testDb, reg.id);
    await revokeCaptain(testDb, reg.id);
    expect(await testDb.team.findUnique({ where: { captainId: reg.id } })).toBeNull();
    expect(await testDb.user.count()).toBe(0);
    expect((await testDb.registration.findUnique({ where: { id: reg.id } }))!.isCaptain).toBe(false);
  });
});
