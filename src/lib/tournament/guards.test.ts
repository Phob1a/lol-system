import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { addCustomMatch } from './schedule-service';
import { recordGame } from './score-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

/** 建赛事 + 分组 + 确认，停在 GROUP_STAGE；返回首场小组赛与 groupId。 */
async function toGroupStage() {
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
  const match = (await testDb.match.findFirst({ where: { groupId: groups[0].id } }))!;
  return { seasonId, teamIds, t, groups, match };
}

async function archive(seasonId: string) {
  await testDb.season.update({
    where: { id: seasonId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

it('归档赛季：recordGame 拒绝', async () => {
  const { seasonId, match } = await toGroupStage();
  const fresh = (await testDb.match.findUnique({ where: { id: match.id } }))!;
  await archive(seasonId);
  await expect(
    recordGame(testDb, { matchId: match.id, expectedVersion: fresh.version, winnerTeamId: match.teamAId!, actorUserId: 'u' }),
  ).rejects.toThrow(/归档/);
});

it('归档赛季：addCustomMatch 拒绝', async () => {
  const { seasonId, t, groups, teamIds } = await toGroupStage();
  await archive(seasonId);
  await expect(
    addCustomMatch(testDb, {
      tournamentId: t.id, groupId: groups[0].id,
      teamAId: teamIds[0], teamBId: teamIds[1],
      bestOf: 1, label: '加赛', countsForStandings: true, actorUserId: 'u',
    }),
  ).rejects.toThrow(/归档/);
});

it('归档赛季：closeGroupStage 拒绝', async () => {
  const { seasonId, t } = await toGroupStage();
  await archive(seasonId);
  await expect(closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/归档/);
});

it('归档赛季：assignGroups 拒绝', async () => {
  const { seasonId, teamIds } = await seedSeasonWithTeams(8);
  const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
  const groups = await testDb.tournamentGroup.findMany({ orderBy: { name: 'asc' } });
  await archive(seasonId);
  await expect(
    assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/归档/);
});
