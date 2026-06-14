import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { testDb } from '@/lib/test/db';
import { createTournament, transitionTournament } from '@/lib/tournament/tournament-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { appointCaptain } from '@/lib/captains/captain-service';
import { listSeasonTeams, resetTeamPassword, updateTeamProfile } from './team-service';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

async function appointed() {
  const tournament = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
  await transitionTournament(testDb, tournament.id, 'REGISTRATION');
  const reg = await submitPublicRegistration(testDb, {
    gameId: 'cap', nickname: '队长', primaryPositions: ['MID'], secondaryPositions: [],
    currentRank: '大师', peakRank: '大师', willingToCaptain: true,
  });
  await transitionTournament(testDb, tournament.id, 'ROSTER_LOCKED');
  const result = await appointCaptain(testDb, reg.id);
  return { tournamentId: tournament.id, teamId: result.teamId };
}

describe('team-service', () => {
  it('lists teams with captain + account username', async () => {
    const { tournamentId } = await appointed();
    const teams = await listSeasonTeams(testDb, tournamentId);
    expect(teams).toHaveLength(1);
    expect(teams[0].account.username).toMatch(/^TEAM-/);
    expect(teams[0].captain.nickname).toBe('队长');
  });

  it('resetTeamPassword returns a new plaintext and updates the hash', async () => {
    const { teamId } = await appointed();
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    const before = await testDb.user.findUniqueOrThrow({ where: { id: team.userId } });
    const { password } = await resetTeamPassword(testDb, teamId);
    const after = await testDb.user.findUniqueOrThrow({ where: { id: team.userId } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await bcrypt.compare(password, after.passwordHash)).toBe(true);
  });

  it('updateTeamProfile updates name and slogan', async () => {
    const { teamId } = await appointed();
    await updateTeamProfile(testDb, teamId, { name: '新队名', slogan: '新口号' });
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.name).toBe('新队名');
    expect(team.slogan).toBe('新口号');
  });

  it('updateTeamProfile accepts a null slogan', async () => {
    const { teamId } = await appointed();
    await updateTeamProfile(testDb, teamId, { name: '队名', slogan: null });
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.slogan).toBeNull();
  });
});
