import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { CFG_2x4x2, seedTournamentWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  const t = (await testDb.tournament.findUnique({ where: { id: tournamentId } }))!;
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
  // Set up two independent tournaments (A and B).
  // createTournament archives the previous active tournament, so we restore tA to SETUP after creating tB.
  const { tournamentId: tournamentIdA, teamIds: teamIdsA } = await seedTournamentWithTeams(8);
  const groupsA = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId: tournamentIdA } },
    orderBy: { name: 'asc' },
  });

  const { tournamentId: tournamentIdB } = await seedTournamentWithTeams(8);
  const groupsB = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId: tournamentIdB } },
    orderBy: { name: 'asc' },
  });

  // Restore tA to SETUP (it was archived when tB was created)
  await testDb.tournament.update({ where: { id: tournamentIdA }, data: { status: 'SETUP', archivedAt: null } });

  // Try assigning tournament A's teams into tournament B's group
  await expect(
    assignGroups(testDb, {
      tournamentId: tournamentIdA,
      assignments: [
        { groupId: groupsA[0].id, teamIds: teamIdsA.slice(0, 4) },
        { groupId: groupsB[0].id, teamIds: teamIdsA.slice(4) }, // groupB's id — cross-tournament!
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/不属于该赛事/);

  // Tournament B's groups must remain empty
  expect(await testDb.tournamentGroupTeam.count({ where: { group: { stage: { tournamentId: tournamentIdB } } } })).toBe(0);
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

it('assignGroups 保存即重建参赛队快照（8 队 × 1 人）', async () => {
  const { t, teamIds, groups } = await setup();
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
  expect(await testDb.tournamentTeamPlayer.count()).toBe(8);
});

it('重新保存不同分组：快照被覆盖（仍 8 队，无残留）', async () => {
  const { t, teamIds, groups } = await setup();
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: [teamIds[4], teamIds[1], teamIds[2], teamIds[3]] },
      { groupId: groups[1].id, teamIds: [teamIds[0], teamIds[5], teamIds[6], teamIds[7]] },
    ],
    actorUserId: 'u',
  });
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
  expect(await testDb.tournamentGroupTeam.count()).toBe(8);
});

it('季外队伍分组被拒，快照不被污染', async () => {
  // Create a separate "other" tournament first; then setup() creates the main tournament (archiving the other).
  // The "other" team still exists in the DB but belongs to a different tournament — perfect for cross-tournament rejection.
  const { teamIds: otherTeamIds } = await seedTournamentWithTeams(1);
  const { t, teamIds, groups } = await setup();
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: [otherTeamIds[0], teamIds[1], teamIds[2], teamIds[3]] },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/不属于该赛事/);
  expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
});
