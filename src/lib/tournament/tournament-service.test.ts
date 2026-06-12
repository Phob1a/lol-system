import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import {
  getTournamentBySeason,
  resetTournament,
  updateTournamentConfig,
} from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { CFG_2x4x2, createTestTournament, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

/** 建赛事 + 分组 + 确认 → GROUP_STAGE。 */
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
  return { seasonId, teamIds, t };
}

describe('updateTournamentConfig', () => {
  it('SETUP：改 config 重建骨架并清空快照/分组', async () => {
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
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);

    // 改为 4 组 × 2 队 × 1 出线（出线 4 → SF/FINAL）
    const newCfg = {
      template: 'group-knockout' as const,
      groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 1,
      groupBestOf: 1 as const, knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
    };
    await updateTournamentConfig(testDb, { tournamentId: t.id, config: newCfg, actorUserId: 'u' });

    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect((after.config as typeof newCfg).groupCount).toBe(4);
    expect(after.status).toBe('SETUP');
    expect(await testDb.tournamentGroup.count()).toBe(4);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0); // 快照清空
    expect(await testDb.tournamentGroupTeam.count()).toBe(0); // 分组清空
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3); // 新骨架 SF×2 + FINAL
    expect(await testDb.auditLog.count({ where: { action: 'tournament.config.update' } })).toBe(1);
  });

  it('非 SETUP：改 config 被拒，但改 kind 允许', async () => {
    const { t } = await toGroupStage();
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, config: CFG_2x4x2, actorUserId: 'u' }),
    ).rejects.toThrow(/SETUP|状态/);
    await updateTournamentConfig(testDb, { tournamentId: t.id, kind: '娱乐赛', actorUserId: 'u' });
    expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.kind).toBe('娱乐赛');
  });

  it('FINISHED：改 name/kind 也被拒', async () => {
    const { t } = await toGroupStage();
    await testDb.tournament.update({ where: { id: t.id }, data: { status: 'FINISHED' } });
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, name: 'x2', actorUserId: 'u' }),
    ).rejects.toThrow(/结束|FINISHED|状态/);
  });

  it('归档赛季：改配置被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTestTournament(testDb, { seasonId, teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, kind: '娱乐赛', actorUserId: 'u' }),
    ).rejects.toThrow(/归档/);
  });
});

describe('resetTournament', () => {
  it('从 KNOCKOUT（含已录局）重置 → SETUP，骨架重建，快照/分组/比分清空', async () => {
    const { t, teamIds } = await toGroupStage();
    for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
      const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
      const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
      await recordGame(testDb, { matchId: gm.id, expectedVersion: fresh.version, winnerTeamId: winner, actorUserId: 'u' });
    }
    await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
    expect((await testDb.tournament.findUnique({ where: { id: t.id } }))!.status).toBe('KNOCKOUT');

    await resetTournament(testDb, { tournamentId: t.id, actorUserId: 'u' });

    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect(after.status).toBe('SETUP');
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3); // 仅 KO 骨架
    expect(await testDb.match.count({ where: { groupId: { not: null } } })).toBe(0);
    expect(await testDb.game.count()).toBe(0);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.tournamentGroupTeam.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: 'tournament.reset' } })).toBe(1);
    expect(await getTournamentBySeason(testDb, t.seasonId)).not.toBeNull(); // 赛事仍在
  });

  it('归档赛季：重置被拒', async () => {
    const { seasonId, t } = await toGroupStage();
    await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await expect(resetTournament(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/归档/);
  });
});
