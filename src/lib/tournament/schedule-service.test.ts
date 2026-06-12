import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament } from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { addCustomMatch } from './schedule-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
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
  return { t, teamIds, groups };
}

it('挂组加赛：source=CUSTOM、计分、双方必须同组', async () => {
  const { t, teamIds, groups } = await setup();
  const m = await addCustomMatch(testDb, {
    tournamentId: t.id,
    groupId: groups[0].id,
    teamAId: teamIds[0],
    teamBId: teamIds[1],
    bestOf: 1,
    label: '加赛',
    countsForStandings: true,
    actorUserId: 'u',
  });
  expect(m.source).toBe('CUSTOM');
  expect(m.countsForStandings).toBe(true);
  expect(m.groupId).toBe(groups[0].id);

  // 跨组队伍 → 拒绝
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: groups[0].id,
      teamAId: teamIds[0], teamBId: teamIds[4],
      bestOf: 1, label: 'bad', countsForStandings: true, actorUserId: 'u',
    }),
  ).rejects.toThrow(/同组/);
});

it('不挂组的表演赛：不计分，挂在 KNOCKOUT 阶段', async () => {
  const { t, teamIds } = await setup();
  const m = await addCustomMatch(testDb, {
    tournamentId: t.id, groupId: null,
    teamAId: teamIds[0], teamBId: teamIds[4],
    bestOf: 3, label: '表演赛', countsForStandings: false, actorUserId: 'u',
  });
  expect(m.countsForStandings).toBe(false);
  expect(m.groupId).toBeNull();
});

it('SETUP 期添加自定义比赛被拒', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  // 仍处于 SETUP（未 confirmGroups）
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: null,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: 'x', countsForStandings: false, actorUserId: 'u',
    }),
  ).rejects.toThrow(/分组确认前/);
});
