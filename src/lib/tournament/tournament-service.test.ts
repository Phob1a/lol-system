import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import {
  createTournament,
  transitionTournament,
  getActiveTournament,
  resetTournament,
  updateTournamentConfig,
} from './tournament-service';
import { assignGroups, confirmGroups } from './groups-service';
import { closeGroupStage } from './bracket-service';
import { recordGame } from './score-service';
import { CFG_2x4x2, seedTeamsForTournament } from './test-fixtures';

beforeEach(resetDb);

const CFG = {
  template: 'group-knockout' as const,
  groupCount: 2,
  teamsPerGroup: 2,
  advancingPerGroup: 1,
  groupBestOf: 1 as const,
  knockoutBestOf: { FINAL: 1 as const },
};
const mk = (name = 'T1') =>
  createTournament(testDb, { name, teamBudget: 1000, kind: '正赛', config: CFG }, 'u');

/** 建赛事 + 分组 + 确认 → GROUP_STAGE。 */
async function toGroupStage() {
  // Create a single tournament, then seed teams into it
  const t = await createTournament(testDb, { name: 'x', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
  const teamIds = await seedTeamsForTournament(t.id, 8);
  // assignGroups now requires GROUPING state
  await testDb.tournament.update({ where: { id: t.id }, data: { status: 'GROUPING' } });
  const groups = await testDb.tournamentGroup.findMany({
    where: { stage: { tournamentId: t.id } },
    orderBy: { name: 'asc' },
  });
  await assignGroups(testDb, {
    tournamentId: t.id,
    assignments: [
      { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
      { groupId: groups[1].id, teamIds: teamIds.slice(4) },
    ],
    actorUserId: 'u',
  });
  await confirmGroups(testDb, { tournamentId: t.id, actorUserId: 'u' });
  return { teamIds, t };
}

describe('transitionTournament', () => {
  it('walks the full linear lifecycle', async () => {
    const t = await mk();
    expect(t.status).toBe('SETUP');
    for (const next of ['REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING'] as const) {
      const u = await transitionTournament(testDb, t.id, next);
      expect(u.status).toBe(next);
    }
  });

  it('rejects illegal edge SETUP -> GROUP_STAGE', async () => {
    const t = await mk();
    await expect(transitionTournament(testDb, t.id, 'GROUP_STAGE')).rejects.toThrow();
  });

  it('allows ROSTER_LOCKED -> REGISTRATION rollback', async () => {
    const t = await mk();
    await transitionTournament(testDb, t.id, 'REGISTRATION');
    await transitionTournament(testDb, t.id, 'ROSTER_LOCKED');
    const u = await transitionTournament(testDb, t.id, 'REGISTRATION');
    expect(u.status).toBe('REGISTRATION');
  });
});

describe('createTournament', () => {
  it('建骨架：2 阶段 / 2 组 / 3 淘汰赛对阵 / 2 晋级边 / 0 快照 / 1 审计', async () => {
    const t = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    expect(t.status).toBe('SETUP');
    expect(t.kind).toBe('正赛');
    expect(await testDb.tournamentStage.count({ where: { tournamentId: t.id } })).toBe(2);
    expect(await testDb.tournamentGroup.count()).toBe(2);
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
    expect(await testDb.matchAdvancementEdge.count()).toBe(2);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: 'tournament.create' } })).toBe(1);
  });

  it('kind 透传（娱乐赛）', async () => {
    const t = await createTournament(testDb, { name: 'S1', teamBudget: 1000, kind: '娱乐赛', config: CFG_2x4x2 }, 'u');
    expect(t.kind).toBe('娱乐赛');
  });

  it('config 非法抛错（原子回滚：无赛事写入）', async () => {
    await expect(
      createTournament(testDb, { name: 'x', teamBudget: 1000, kind: '正赛', config: { template: 'group-knockout', groupCount: 0 } as never }, 'u'),
    ).rejects.toThrow();
    expect(await testDb.tournament.count()).toBe(0);
  });
});

describe('archiveActiveTournament', () => {
  it('keeps at most one non-archived tournament', async () => {
    const a = await mk('A');
    const b = await mk('B'); // creating B archives A
    const found = (await testDb.tournament.findUnique({ where: { id: a.id } }))!;
    expect(found.status).toBe('ARCHIVED');
    expect(found.archivedAt).not.toBeNull();
    const active = await getActiveTournament(testDb);
    expect(active!.id).toBe(b.id);
  });
});

describe('updateTournamentConfig', () => {
  it('GROUPING：改 config 重建骨架并清空快照/分组', async () => {
    const t = await createTournament(testDb, { name: 'x', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    const teamIds = await seedTeamsForTournament(t.id, 8);
    // assignGroups requires GROUPING state
    await testDb.tournament.update({ where: { id: t.id }, data: { status: 'GROUPING' } });
    const groups = await testDb.tournamentGroup.findMany({
      where: { stage: { tournamentId: t.id } },
      orderBy: { name: 'asc' },
    });
    await assignGroups(testDb, {
      tournamentId: t.id,
      assignments: [
        { groupId: groups[0].id, teamIds: teamIds.slice(0, 4) },
        { groupId: groups[1].id, teamIds: teamIds.slice(4) },
      ],
      actorUserId: 'u',
    });
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(8);

    // 改为 4 组 × 2 队 × 1 出线（出线 4 → SF/FINAL）；config editable in GROUPING per new window
    const newCfg = {
      template: 'group-knockout' as const,
      groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 1,
      groupBestOf: 1 as const, knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
    };
    await updateTournamentConfig(testDb, { tournamentId: t.id, config: newCfg, actorUserId: 'u' });

    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect((after.config as typeof newCfg).groupCount).toBe(4);
    expect(after.status).toBe('GROUPING'); // status unchanged by updateTournamentConfig
    expect(await testDb.tournamentGroup.count()).toBe(4);
    expect(await testDb.tournamentTeam.count({ where: { tournamentId: t.id } })).toBe(0); // 快照清空
    expect(await testDb.tournamentGroupTeam.count()).toBe(0); // 分组清空
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3); // 新骨架 SF×2 + FINAL
    expect(await testDb.auditLog.count({ where: { action: 'tournament.config.update' } })).toBe(1);
  });

  it('REGISTRATION：改 config 重建骨架（pre-GROUP_STAGE 允许路径）', async () => {
    const t = await createTournament(testDb, { name: 'x', teamBudget: 1000, kind: '正赛', config: CFG_2x4x2 }, 'u');
    await transitionTournament(testDb, t.id, 'REGISTRATION');
    // Change to a different valid config (4 groups × 2 teams × 1 advancing → SF + FINAL)
    const newCfg = {
      template: 'group-knockout' as const,
      groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 1,
      groupBestOf: 1 as const, knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
    };
    await updateTournamentConfig(testDb, { tournamentId: t.id, config: newCfg, actorUserId: 'u' });
    const after = (await testDb.tournament.findUnique({ where: { id: t.id } }))!;
    expect((after.config as typeof newCfg).groupCount).toBe(4);
    expect(after.status).toBe('REGISTRATION'); // status unchanged
    expect(await testDb.tournamentGroup.count()).toBe(4);
  });

  it('GROUP_STAGE 以后：改 config 被拒，但改 kind 允许', async () => {
    const { t } = await toGroupStage();
    await expect(
      updateTournamentConfig(testDb, { tournamentId: t.id, config: CFG_2x4x2, actorUserId: 'u' }),
    ).rejects.toThrow(/小组赛|状态/);
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

  it('归档赛事：改配置被拒', async () => {
    const t = await mk();
    await testDb.tournament.update({ where: { id: t.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
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
    expect(await testDb.tournament.findUnique({ where: { id: t.id } })).not.toBeNull(); // 赛事仍在
  });

  it('归档赛事：重置被拒', async () => {
    const t = await mk();
    await testDb.tournament.update({ where: { id: t.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await expect(resetTournament(testDb, { tournamentId: t.id, actorUserId: 'u' })).rejects.toThrow(/归档/);
  });
});
