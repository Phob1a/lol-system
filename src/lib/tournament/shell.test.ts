import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { createTournamentShell } from './tournament-service';
import { CFG_2x4x2, seedSeasonWithTeams } from './test-fixtures';

beforeEach(resetDb);

it('shell 建骨架：2 阶段 / 2 组 / 3 淘汰赛 / 2 边 / 0 快照', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  const t = await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'S1', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
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
  const { seasonId } = await seedSeasonWithTeams(8);
  const t = await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'S1', kind: '娱乐赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
  expect(t.kind).toBe('娱乐赛');
});

it('同赛季重复创建被拒', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await testDb.$transaction((tx) =>
    createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
  );
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/已存在/);
});

it('赛季不存在被拒', async () => {
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId: 'nope', name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/赛季不存在/);
});

it('config 非法抛错', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: { template: 'group-knockout', groupCount: 0 } as never, actorUserId: 'u' }),
    ),
  ).rejects.toThrow();
});

it('归档赛季 shell 创建被拒', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  await expect(
    testDb.$transaction((tx) =>
      createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' }),
    ),
  ).rejects.toThrow(/归档/);
});

it('调用方事务抛错时 shell 写入全部回滚（原子性）', async () => {
  const { seasonId } = await seedSeasonWithTeams(8);
  await expect(
    testDb.$transaction(async (tx) => {
      await createTournamentShell(tx, { seasonId, name: 'x', kind: '正赛', config: CFG_2x4x2, actorUserId: 'u' });
      throw new Error('boom');
    }),
  ).rejects.toThrow(/boom/);
  expect(await testDb.tournament.count()).toBe(0);
  expect(await testDb.tournamentStage.count()).toBe(0);
  expect(await testDb.match.count()).toBe(0);
});
