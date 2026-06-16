import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { addCustomMatch } from './schedule-service';
import { seedTournamentWithTeams } from './test-fixtures';

beforeEach(resetDb);

async function setup() {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  const groups = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId } },
    orderBy: { name: 'asc' },
  });
  await assignGroups(testDb, {
    tournamentId,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId, actorUserId: 'u' });
  const t = (await testDb.tournament.findUnique({ where: { id: tournamentId } }))!;
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

it('自定义比赛创建时不写预约时间', async () => {
  const { t, teamIds } = await setup();
  const input = {
    tournamentId: t.id,
    groupId: null,
    teamAId: teamIds[0],
    teamBId: teamIds[4],
    bestOf: 1,
    label: '待预约表演赛',
    countsForStandings: false,
    scheduledAt: new Date('2026-06-13T12:30:00Z'),
    actorUserId: 'u',
  };

  const m = await addCustomMatch(testDb, input);

  expect(m.scheduledAt).toBeNull();
});

it('GROUPING 状态添加自定义比赛被拒', async () => {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  // Still in GROUPING (no confirmGroups called)
  await expect(
    addCustomMatch(testDb, {
      tournamentId, groupId: null,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: 'x', countsForStandings: false, actorUserId: 'u',
    }),
  ).rejects.toThrow(/状态/);
});

it('DRAFTING 状态添加自定义比赛被拒', async () => {
  const { tournamentId, teamIds } = await seedTournamentWithTeams(8);
  await testDb.tournament.update({ where: { id: tournamentId }, data: { status: 'DRAFTING' } });
  await expect(
    addCustomMatch(testDb, {
      tournamentId, groupId: null,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: 'x', countsForStandings: false, actorUserId: 'u',
    }),
  ).rejects.toThrow(/状态/);
});

it('GROUP_STAGE 状态添加自定义比赛成功', async () => {
  const { t, teamIds } = await setup();
  // setup() already calls confirmGroups which sets GROUP_STAGE
  expect(t.status).toBe('GROUP_STAGE');
  const m = await addCustomMatch(testDb, {
    tournamentId: t.id, groupId: null,
    teamAId: teamIds[0], teamBId: teamIds[4],
    bestOf: 1, label: '表演赛', countsForStandings: false, actorUserId: 'u',
  });
  expect(m.source).toBe('CUSTOM');
});
