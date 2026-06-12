import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, {
    seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u',
  });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  return { t, teamIds, groups };
}

it('assignGroups 写入成员；队数不符被拒', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentGroupTeam.count()).toBe(8);

  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 3) },
        { groupId: groups[1].id, teamIds: teamIds.slice(3) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/每组 4 支/);
});

it('confirmGroups 生成组内单循环并置 GROUP_STAGE；重复确认被拒', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });

  const groupMatches = await testDb.match.findMany({ where: { groupId: { not: null } } });
  expect(groupMatches).toHaveLength(12); // 2 组 × C(4,2)
  expect(groupMatches.every((m) => m.teamAId && m.teamBId && m.bestOf === 1)).toBe(true);
  expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('GROUP_STAGE');

  await expect(confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/状态/);
});
