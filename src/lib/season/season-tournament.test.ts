import { expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, getActiveSeason } from './season-service';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

const TOURNAMENT = { kind: '正赛', config: CFG_2x4x2 };

it('建赛季同事务建赛事骨架（season + tournament + 骨架）', async () => {
  const season = await createSeason(
    testDb,
    { name: 'S1', teamBudget: 1000, tournament: TOURNAMENT },
    'admin-1',
  );
  expect(season.status).toBe('SETUP');
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  expect(t).not.toBeNull();
  expect(t.name).toBe('S1'); // tournament.name 缺省 = 赛季名
  expect(t.kind).toBe('正赛');
  expect(await testDb.tournamentStage.count({ where: { tournamentId: t.id } })).toBe(2);
  expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(3);
  expect(await testDb.tournamentTeam.count()).toBe(0);
});

it('tournament.name 覆盖赛季名', async () => {
  const season = await createSeason(
    testDb,
    { name: 'S1', teamBudget: 1000, tournament: { name: '夏季正赛', kind: '正赛', config: CFG_2x4x2 } },
    'admin-1',
  );
  const t = (await testDb.tournament.findUnique({ where: { seasonId: season.id } }))!;
  expect(t.name).toBe('夏季正赛');
});

it('config 非法 → 整体回滚（无 season 行）', async () => {
  await expect(
    createSeason(
      testDb,
      { name: 'S1', teamBudget: 1000, tournament: { kind: '正赛', config: { template: 'group-knockout', groupCount: 0 } } },
      'admin-1',
    ),
  ).rejects.toThrow();
  expect(await testDb.season.count()).toBe(0);
  expect(await testDb.tournament.count()).toBe(0);
});

it('建新赛季归档旧活跃赛季', async () => {
  const first = await createSeason(testDb, { name: 'S1', teamBudget: 1000, tournament: TOURNAMENT }, 'u');
  await createSeason(testDb, { name: 'S2', teamBudget: 1000, tournament: TOURNAMENT }, 'u');
  expect((await testDb.season.findUnique({ where: { id: first.id } }))!.status).toBe('ARCHIVED');
  expect((await getActiveSeason(testDb))?.name).toBe('S2');
});
