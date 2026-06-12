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

it('assignGroups 跨赛事 groupId 被拒，且对方赛事的分组数据不受污染', async () => {
  // Set up two independent tournaments (A and B)
  const { seasonId: seasonIdA, teamIds: teamIdsA } = await seedSeasonWithTeams(8);
  const tA = await createTournament(testDb, {
    seasonId: seasonIdA, name: 'A', teamIds: teamIdsA, config: CFG_2x4x2, actorUserId: 'u',
  });
  const groupsA = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId: tA.id } },
    orderBy: { name: 'asc' },
  });

  const { seasonId: seasonIdB, teamIds: teamIdsB } = await seedSeasonWithTeams(8);
  const tB = await createTournament(testDb, {
    seasonId: seasonIdB, name: 'B', teamIds: teamIdsB, config: CFG_2x4x2, actorUserId: 'u',
  });
  const groupsB = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId: tB.id } },
    orderBy: { name: 'asc' },
  });

  // Try assigning tournament A's teams into tournament B's group
  await expect(
    assignGroups(testDb, {
      tournamentId: tA.id,
      assignments: [
        { groupId: groupsA[0].id, teamIds: teamIdsA.slice(0, 4) },
        { groupId: groupsB[0].id, teamIds: teamIdsA.slice(4) }, // groupB's id — cross-tournament!
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/不属于该赛事/);

  // Tournament B's groups must remain empty
  expect(await testDb.tournamentGroupTeam.count({ where: { group: { stage: { tournamentId: tB.id } } } })).toBe(0);
});

it('assignGroups 分组重复（两条 assignment 使用同一个 groupId）被拒', async () => {
  const { t, teamIds, groups } = await setup();
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
        { groupId: groups[0].id, teamIds: teamIds.slice(4) }, // same groupId — duplicate!
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/重复/);
});

it('assignGroups 仅覆盖部分分组（缺少覆盖）被拒', async () => {
  const { t, teamIds, groups } = await setup();
  // Only one assignment provided for a 2-group tournament.
  // If the team-count check fires first (有队伍未分组) that is also acceptable;
  // the group-coverage guard must at minimum exist and reject this request.
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/有分组未覆盖|有队伍未分组/);
});
