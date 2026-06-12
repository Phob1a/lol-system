import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { getAdminOverviewStats } from './overview-stats';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

const T = { kind: '正赛', config: CFG_2x4x2 };

describe('getAdminOverviewStats', () => {
  it('counts willing captain registrations as captain intentions', async () => {
    const season = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: T }, 'u');
    await transitionSeason(testDb, season.id, 'REGISTRATION');

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

    await expect(getAdminOverviewStats(testDb, season.id)).resolves.toMatchObject({
      registrationCount: 2,
      captainIntentionCount: 1,
    });
  });
});
