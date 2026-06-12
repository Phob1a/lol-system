import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournament, deleteTournament, getTournamentBySeason } from './tournament-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

describe('createTournament', () => {
  it('创建赛事：阶段/分组占位/淘汰赛比赛/晋级边/阵容快照全部落库', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTournament(testDb, {
      seasonId,
      name: 'S1 赛事',
      teamIds,
      config: CFG_2x4x2,
      actorUserId: 'admin-1',
    });
    expect(t.status).toBe('SETUP');
    // 阶段：GROUP + KNOCKOUT；组 A/B；淘汰赛 SF×2 + FINAL×1（小组赛对阵在分组确认后才生成）
    const stages = await testDb.tournamentStage.findMany({ where: { tournamentId: t.id } });
    expect(stages).toHaveLength(2);
    expect(await testDb.tournamentGroup.count()).toBe(2);
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
    expect(await testDb.matchAdvancementEdge.count()).toBe(2);
    // 快照：8 队 × 1 人
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);
    expect(await testDb.tournamentTeamPlayer.count()).toBe(8);
    // 审计
    expect(await testDb.auditLog.count({ where: { action: 'tournament.create' } })).toBe(1);
  });

  it('同赛季重复创建被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const input = { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' };
    await createTournament(testDb, input);
    await expect(createTournament(testDb, input)).rejects.toThrow(/已存在/);
  });

  it('队伍数与配置不符被拒', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(6);
    await expect(
      createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' }),
    ).rejects.toThrow(/需要 8 支队伍/);
  });

  it('异赛季队伍被拒（跨赛季校验）', async () => {
    const a = await seedSeasonWithTeams(7);
    const b = await seedSeasonWithTeams(1);
    await expect(
      createTournament(testDb, {
        seasonId: a.seasonId,
        name: 'x',
        teamIds: [...a.teamIds, ...b.teamIds],
        config: CFG_2x4x2,
        actorUserId: 'u',
      }),
    ).rejects.toThrow(/不属于该赛季/);
  });
});

describe('deleteTournament', () => {
  it('SETUP 状态可删，级联清空', async () => {
    const { seasonId, teamIds } = await seedSeasonWithTeams(8);
    const t = await createTournament(testDb, { seasonId, name: 'x', teamIds, config: CFG_2x4x2, actorUserId: 'u' });
    await deleteTournament(testDb, { tournamentId: t.id, actorUserId: 'u' });
    expect(await getTournamentBySeason(testDb, seasonId)).toBeNull();
    expect(await testDb.match.count()).toBe(0);
  });
});
