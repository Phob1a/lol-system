import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createTournament, transitionTournament } from '@/lib/tournament/tournament-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { getAdminOverviewStats } from './overview-stats';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

describe('getAdminOverviewStats', () => {
  it('counts willing captain registrations as captain intentions', async () => {
    const tournament = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    await transitionTournament(testDb, tournament.id, 'REGISTRATION');

    await submitPublicRegistration(testDb, {
      gameId: 'faker',
      nickname: '李哥',
      primaryPositions: ['MID'],
      secondaryPositions: [],
      currentRank: '大师',
      peakRank: '宗师',
      willingToCaptain: true,
    });
    await submitPublicRegistration(testDb, {
      gameId: 'uzi',
      nickname: '小狗',
      primaryPositions: ['ADC'],
      secondaryPositions: [],
      currentRank: '大师',
      peakRank: '宗师',
      willingToCaptain: false,
    });

    await expect(getAdminOverviewStats(testDb, tournament.id)).resolves.toMatchObject({
      registrationCount: 2,
      captainIntentionCount: 1,
    });
  });
});
