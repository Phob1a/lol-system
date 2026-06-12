import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { deleteTournament, getTournamentBySeason } from './tournament-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

describe('deleteTournament', () => {
  it('SETUP 状态可删，级联清空', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    await deleteTournament(testDb, { tournamentId: t.id, actorUserId: 'u' });
    expect(await getTournamentBySeason(testDb, seasonId)).toBeNull();
    expect(await testDb.match.count()).toBe(0);
  });
});
