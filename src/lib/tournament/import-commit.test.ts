import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { commitImport, ingestImport } from './import-service';
import { resolvePid } from './import-schema';
import { setupGroupStage } from './score-service.test-helpers';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { prisma } from '@/lib/db';
import sample from '@/lib/test/fixtures/sample-summary.json';

beforeEach(resetDb);

const SAMPLE_BLUE = sample.players.filter((p) => p.teamId === 100).map((p) => p.name);
const SAMPLE_RED = sample.players.filter((p) => p.teamId === 200).map((p) => p.name);

/** 推进到决赛双方就位（不开打）。复用 import-mapping.test 的 setup 思路。 */
async function toFinal() {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort(
      (a, b) => teamIds.indexOf(a) - teamIds.indexOf(b),
    )[0];
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, {
      matchId: gm.id,
      expectedVersion: f.version,
      winnerTeamId: winner,
      actorUserId: 'u',
    });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, {
        matchId: sf.id,
        expectedVersion: f.version,
        winnerTeamId: f.teamAId!,
        actorUserId: 'u',
      });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  return { t, final };
}

/** 为指定 tournamentTeam 重建若干 TournamentTeamPlayer，每人 Player.gameId 对应 names[i]。 */
async function seedRosterWithGameIds(
  tournamentId: string,
  teamId: string,
  names: string[],
): Promise<string[]> {
  const tt = (await testDb.tournamentTeam.findFirst({ where: { tournamentId, teamId } }))!;
  await testDb.tournamentTeamPlayer.deleteMany({ where: { tournamentTeamId: tt.id } });
  const regIds: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const player = await testDb.player.create({
      data: { gameId: names[i], nickname: `选手${teamId}-${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        tournamentId,
        playerId: player.id,
        nickname: `选手${teamId}-${i}`,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        currentRank: 'GOLD',
        peakRank: 'PLATINUM',
        cost: 100,
        status: 'ACTIVE',
      },
    });
    await testDb.tournamentTeamPlayer.create({
      data: { tournamentTeamId: tt.id, registrationId: reg.id },
    });
    regIds.push(reg.id);
  }
  return regIds;
}

type Ctx = {
  matchId: string;
  blueTeamId: string;
  redTeamId: string;
  matchVersion: number;
  importId: string;
  blueRegByName: Map<string, string>;
  redRegByName: Map<string, string>;
  fullMappings: { capturedParticipantId: number; registrationId: string }[];
};

/** blueTeamId=final.teamAId（蓝=teamId 100 名单），redTeamId=final.teamBId（红=teamId 200 名单）。 */
async function setupImportCtx(rawOverride?: unknown): Promise<Ctx> {
  const { t, final } = await toFinal();
  const blueTeamId = final.teamAId!;
  const redTeamId = final.teamBId!;
  const blueRegIds = await seedRosterWithGameIds(t.id, blueTeamId, SAMPLE_BLUE);
  const redRegIds = await seedRosterWithGameIds(t.id, redTeamId, SAMPLE_RED);
  const blueRegByName = new Map(SAMPLE_BLUE.map((n, i) => [n, blueRegIds[i]]));
  const redRegByName = new Map(SAMPLE_RED.map((n, i) => [n, redRegIds[i]]));

  const raw = rawOverride ?? sample;
  const { importId } = await ingestImport(testDb, raw, 'SCRIPT');
  const match = (await testDb.match.findUnique({ where: { id: final.id } }))!;

  // 映射键始终以原始 sample 的捕获 pid 为准（与 buildMapping 一致）
  const fullMappings = sample.players.map((p, i) => {
    const regId = p.teamId === 100 ? blueRegByName.get(p.name)! : redRegByName.get(p.name)!;
    return { capturedParticipantId: resolvePid(p, i), registrationId: regId };
  });

  return {
    matchId: final.id,
    blueTeamId,
    redTeamId,
    matchVersion: match.version,
    importId,
    blueRegByName,
    redRegByName,
    fullMappings,
  };
}

function errCode(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => {
      throw new Error('expected to throw');
    },
    (e) => (e as { code?: string }).code ?? 'NO_CODE',
  );
}

it('happy：完整提交 → 落库 + 标记 COMMITTED', async () => {
  const ctx = await setupImportCtx();
  const { gameId } = await commitImport(
    testDb,
    ctx.importId,
    {
      matchId: ctx.matchId,
      expectedVersion: ctx.matchVersion,
      gameIndex: 1,
      blueTeamId: ctx.blueTeamId,
      mappings: ctx.fullMappings,
    },
    'admin1',
  );

  const game = (await testDb.game.findUnique({ where: { id: gameId } }))!;
  expect(game.index).toBe(1);
  // 红方（teamId 200）win=true → 胜者是红方
  expect(game.winnerTeamId).toBe(ctx.redTeamId);
  expect(game.blueTeamId).toBe(ctx.blueTeamId);

  const stats = await testDb.gamePlayerStat.findMany({ where: { gameId } });
  expect(stats).toHaveLength(10);
  for (const s of stats) {
    expect(s.extStats).not.toBeNull();
    expect(s.championId).toMatch(/^[A-Za-z]/); // DD key 以字母开头，不是数字
  }

  const imp = (await testDb.matchImport.findUnique({ where: { id: ctx.importId } }))!;
  expect(imp.status).toBe('COMMITTED');
  expect(imp.committedGameId).toBe(gameId);
});

it('某 capturedParticipantId 无映射 → VALIDATION', async () => {
  const ctx = await setupImportCtx();
  // 仍 10 条（满足 zod），但把第 10 条的 pid 改为不存在 → 第 10 名选手未映射
  const partial = ctx.fullMappings.map((m, i) =>
    i === 9 ? { ...m, capturedParticipantId: 99999 } : m,
  );
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: partial,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('registrationId 映射到非本阵营 → VALIDATION', async () => {
  const ctx = await setupImportCtx();
  // 把第 1 个蓝方选手映射到一个红方 registrationId
  const aRedReg = ctx.redRegByName.get(SAMPLE_RED[0])!;
  const tampered = ctx.fullMappings.map((m, i) =>
    i === 0 ? { ...m, registrationId: aRedReg } : m,
  );
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: tampered,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('10 人映射出现重复 registrationId → VALIDATION', async () => {
  const ctx = await setupImportCtx();
  const dup = ctx.fullMappings.map((m, i) =>
    i === 1 ? { ...m, registrationId: ctx.fullMappings[0].registrationId } : m,
  );
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: dup,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('胜负字段异常（败方有人 win=true）→ VALIDATION', async () => {
  // 篡改 sample：让一个 teamId=100（败方）选手 win=true
  const tampered = structuredClone(sample);
  (tampered.players.find((p) => p.teamId === 100)!.stats as Record<string, unknown>).win = true;
  const ctx = await setupImportCtx(tampered);
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('未知 LCU teamId（300）→ VALIDATION', async () => {
  const tampered = structuredClone(sample);
  tampered.players[0].teamId = 300;
  const ctx = await setupImportCtx(tampered);
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('某侧人数 != 5 → VALIDATION', async () => {
  // 把一个红方选手改成蓝方 → 6 蓝 4 红
  const tampered = structuredClone(sample);
  tampered.players.find((p) => p.teamId === 200)!.teamId = 100;
  const ctx = await setupImportCtx(tampered);
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('未知数字 championId（9999999）→ VALIDATION', async () => {
  const tampered = structuredClone(sample);
  tampered.players[0].championId = 9999999;
  const ctx = await setupImportCtx(tampered);
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        ctx.importId,
        {
          matchId: ctx.matchId,
          expectedVersion: ctx.matchVersion,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('VALIDATION');
});

it('重复 externalGameId 已 COMMITTED → CONFLICT（P2002）', async () => {
  const ctx = await setupImportCtx();
  const match0 = (await testDb.match.findUnique({ where: { id: ctx.matchId } }))!;
  await commitImport(
    testDb,
    ctx.importId,
    {
      matchId: ctx.matchId,
      expectedVersion: match0.version,
      gameIndex: 1,
      blueTeamId: ctx.blueTeamId,
      mappings: ctx.fullMappings,
    },
    'admin1',
  );

  // 再次 ingest 同一 sample（同 externalGameId），提交到下一局
  const { importId: importId2 } = await ingestImport(testDb, sample, 'SCRIPT');
  const match1 = (await testDb.match.findUnique({ where: { id: ctx.matchId } }))!;
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        importId2,
        {
          matchId: ctx.matchId,
          expectedVersion: match1.version,
          gameIndex: 2,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('CONFLICT');
});

it('gameIndex 冲突：已有正式数据 / 越界下一局 → CONFLICT', async () => {
  const ctx = await setupImportCtx();
  const match0 = (await testDb.match.findUnique({ where: { id: ctx.matchId } }))!;
  await commitImport(
    testDb,
    ctx.importId,
    {
      matchId: ctx.matchId,
      expectedVersion: match0.version,
      gameIndex: 1,
      blueTeamId: ctx.blueTeamId,
      mappings: ctx.fullMappings,
    },
    'admin1',
  );

  // 新 import（不同 externalGameId 避免 P2002）再次提交到已占用的 index 1
  const sample2 = structuredClone(sample);
  sample2.gameId = sample.gameId + 1;
  const { importId: importId2 } = await ingestImport(testDb, sample2, 'SCRIPT');
  const match1 = (await testDb.match.findUnique({ where: { id: ctx.matchId } }))!;
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        importId2,
        {
          matchId: ctx.matchId,
          expectedVersion: match1.version,
          gameIndex: 1,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('CONFLICT');

  // 越界：下一局应为 2，传 5 → CONFLICT
  const sample3 = structuredClone(sample);
  sample3.gameId = sample.gameId + 2;
  const { importId: importId3 } = await ingestImport(testDb, sample3, 'SCRIPT');
  const match2 = (await testDb.match.findUnique({ where: { id: ctx.matchId } }))!;
  await expect(
    errCode(() =>
      commitImport(
        testDb,
        importId3,
        {
          matchId: ctx.matchId,
          expectedVersion: match2.version,
          gameIndex: 5,
          blueTeamId: ctx.blueTeamId,
          mappings: ctx.fullMappings,
        },
        'admin1',
      ),
    ),
  ).resolves.toBe('CONFLICT');
});

// prisma 仅用于确认 commitImport 接受 PrismaClient（与生产 db 同类型）
void prisma;
