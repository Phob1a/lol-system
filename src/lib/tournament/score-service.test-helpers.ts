import { testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

/** 建赛事 + 分组 + 确认 → GROUP_STAGE。返回 { t, teamIds, groups, seasonId }。 */
export async function setupGroupStage() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });
  return { t, teamIds, groups, seasonId };
}
