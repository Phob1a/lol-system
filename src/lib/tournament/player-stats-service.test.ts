import type { Prisma } from '@prisma/client';
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { recordGame } from './score-service';
import { closeGroupStage } from './bracket-service';
import { saveGameDetail } from './game-detail-service';
import { getPlayerTournamentStats, listPlayerTournamentProfiles } from './player-stats-service';
import { getChampions } from './champions';
import { expandRosterTo5, seedTournamentWithTeams } from './test-fixtures';
import { setupGroupStage } from './score-service.test-helpers';

beforeEach(resetDb);
const C = getChampions().map((c) => c.key);

async function finalWithRosters() {
  const { t, teamIds } = await setupGroupStage();
  for (const gm of await testDb.match.findMany({ where: { groupId: { not: null } } })) {
    const winner = [gm.teamAId!, gm.teamBId!].sort((a, b) => teamIds.indexOf(a) - teamIds.indexOf(b))[0];
    const f = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, { matchId: gm.id, expectedVersion: f.version, winnerTeamId: winner, actorUserId: 'u' });
  }
  await closeGroupStage(testDb, { tournamentId: t.id, actorUserId: 'u' });
  for (const sf of await testDb.match.findMany({ where: { roundKey: 'SF' } })) {
    let f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    const need = Math.ceil(f.bestOf / 2);
    for (let w = 0; w < need; w++) {
      await recordGame(testDb, { matchId: sf.id, expectedVersion: f.version, winnerTeamId: f.teamAId!, actorUserId: 'u' });
      f = (await testDb.match.findUnique({ where: { id: sf.id } }))!;
    }
  }
  const final = (await testDb.match.findFirst({ where: { roundKey: 'FINAL' } }))!;
  return { t, final };
}

const stats = (teamId: string, regs: string[], off: number) =>
  regs.map((registrationId, k) => ({ teamId, registrationId, championId: C[(k + off) % C.length], kills: 3, deaths: 1, assists: 2, cs: 180, damage: 15000, gold: 11000 }));

const statsWithCarry = (
  teamId: string,
  regs: string[],
  off: number,
  carry: {
    registrationId: string;
    championId: string;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    damage: number;
    gold: number;
  },
) =>
  regs.map((registrationId, k) =>
    registrationId === carry.registrationId
      ? { teamId, registrationId, championId: carry.championId, kills: carry.kills, deaths: carry.deaths, assists: carry.assists, cs: carry.cs, damage: carry.damage, gold: carry.gold }
      : { teamId, registrationId, championId: C[(k + off) % C.length], kills: 1, deaths: 2, assists: 3, cs: 150, damage: 10000, gold: 9000 },
  );

it('汇总 + 逐场明细；MVP 标记', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id, expectedVersion: final.version,
    detail: { winnerTeamId: final.teamAId, playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)], mvpRegistrationId: a[0] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;
  expect(res.summary.games).toBe(1);
  expect(res.summary.mvpCount).toBe(1);
  expect(res.games).toHaveLength(1);
  expect(res.games[0].isMvp).toBe(true);
  expect(res.games[0].kills).toBe(3);
  expect(typeof res.games[0].matchLabel).toBe('string');
  expect(res.games[0].opponent).toBeTruthy();
  expect(res.games[0].championId).toBeTruthy();
});

it('跨赛事隔离：仅取指定赛事的数据（真实第二赛事，验证 match.tournamentId 过滤）', async () => {
  // Tournament #1: seed a FINAL with game stats for player a[0]
  const { t: t1, final: final1 } = await finalWithRosters();
  const a = await expandRosterTo5(t1.id, final1.teamAId!);
  const b = await expandRosterTo5(t1.id, final1.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final1.id, expectedVersion: final1.version,
    detail: { winnerTeamId: final1.teamAId, playerStats: [...stats(final1.teamAId!, a, 0), ...stats(final1.teamBId!, b, 5)] },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  // Verify player has 1 game in tournament #1
  const res1 = (await getPlayerTournamentStats(testDb, reg.playerId, t1.id))!;
  expect(res1.summary.games).toBe(1);

  // Tournament #2: a real second tournament; register the SAME player to bypass the early-return path
  // so that getPlayerTournamentStats actually runs the match.tournamentId filter query
  const { tournamentId: t2Id } = await seedTournamentWithTeams(4);
  await testDb.registration.create({
    data: {
      tournamentId: t2Id, playerId: reg.playerId, nickname: reg.nickname,
      primaryPositions: ['MID'], secondaryPositions: [],
      currentRank: 'GOLD', peakRank: 'PLATINUM', cost: 100,
      status: 'ACTIVE', isCaptain: false,
    },
  });

  // Querying tournament #2 must return 0 games — the player has a registration in t2
  // but no game stats; the match.tournamentId filter must not bleed t1 stats through
  const res2 = (await getPlayerTournamentStats(testDb, reg.playerId, t2Id))!;
  expect(res2.summary.games).toBe(0);
});

it('返回胜率、常用英雄和最近比赛走势', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const championA = C[0];
  const championB = C[1];

  const writeGame = async (winnerTeamId: string, carry: Parameters<typeof statsWithCarry>[3]) => {
    const fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
    await saveGameDetail(testDb, {
      matchId: final.id,
      expectedVersion: fresh.version,
      detail: {
        winnerTeamId,
        playerStats: [
          ...statsWithCarry(final.teamAId!, a, 0, carry),
          ...statsWithCarry(final.teamBId!, b, 5, {
            registrationId: b[0],
            championId: C[9],
            kills: 2,
            deaths: 3,
            assists: 4,
            cs: 160,
            damage: 12000,
            gold: 9500,
          }),
        ],
        mvpRegistrationId: carry.registrationId,
      },
      actorUserId: 'u',
    });
  };

  await writeGame(final.teamAId!, {
    registrationId: a[0],
    championId: championA,
    kills: 7,
    deaths: 1,
    assists: 8,
    cs: 240,
    damage: 34120,
    gold: 14860,
  });
  await writeGame(final.teamBId!, {
    registrationId: a[0],
    championId: championB,
    kills: 3,
    deaths: 4,
    assists: 5,
    cs: 205,
    damage: 21700,
    gold: 11330,
  });
  await writeGame(final.teamAId!, {
    registrationId: a[0],
    championId: championA,
    kills: 6,
    deaths: 2,
    assists: 7,
    cs: 230,
    damage: 31980,
    gold: 14210,
  });

  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;

  expect(res.registrationId).toBe(reg.id);
  expect(res.teamName).toBeTruthy();
  expect(res.primaryPosition).toBe('MID');
  expect(res.summary.winRate).toBe(66.7);
  expect(res.commonChampions[0]).toMatchObject({
    championId: championA,
    games: 2,
    wins: 2,
    winRate: 100,
  });
  expect(res.commonChampions[1]).toMatchObject({
    championId: championB,
    games: 1,
    wins: 0,
    winRate: 0,
  });
  expect(res.games.map((g) => g.win)).toEqual([true, false, true]);
  expect(res.recentForm).toEqual([true, false, true]);
});

it('一次返回赛事内所有选手 profile，默认可按 KDA 选择', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id,
    expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamAId,
      playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)],
      mvpRegistrationId: a[0],
    },
    actorUserId: 'u',
  });

  const profiles = await listPlayerTournamentProfiles(testDb, t.id);

  expect(profiles.length).toBeGreaterThanOrEqual(10);
  expect(profiles[0].summary.kda).toBeGreaterThanOrEqual(profiles[1].summary.kda);
  expect(profiles.some((p) => p.registrationId === a[0] && p.summary.games === 1)).toBe(true);
});

it('聚合 extStats 扩展字段，单人详情带 raw，排行榜不带 raw', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;

  const writeImportedGame = async (
    winnerTeamId: string,
    carry: Parameters<typeof statsWithCarry>[3],
    extStats: Record<string, unknown>,
  ) => {
    const fresh = (await testDb.match.findUnique({ where: { id: final.id } }))!;
    const { gameId } = await saveGameDetail(testDb, {
      matchId: final.id,
      expectedVersion: fresh.version,
      detail: {
        winnerTeamId,
        playerStats: [
          ...statsWithCarry(final.teamAId!, a, 0, carry),
          ...statsWithCarry(final.teamBId!, b, 5, {
            registrationId: b[0],
            championId: C[9],
            kills: 2,
            deaths: 3,
            assists: 4,
            cs: 160,
            damage: 12000,
            gold: 9500,
          }),
        ],
      },
      actorUserId: 'u',
    });
    await testDb.gamePlayerStat.update({
      where: { gameId_registrationId: { gameId, registrationId: a[0] } },
      data: { extStats: extStats as Prisma.InputJsonValue },
    });
    return gameId;
  };

  const game1 = await writeImportedGame(final.teamAId!, {
    registrationId: a[0],
    championId: C[0],
    kills: 8,
    deaths: 2,
    assists: 9,
    cs: 210,
    damage: 30423,
    gold: 12436,
  }, {
    champLevel: 16,
    spell1Id: 14,
    spell2Id: 4,
    totalDamageDealtToChampions: 30423,
    physicalDamageDealtToChampions: 21840,
    magicDamageDealtToChampions: 6420,
    trueDamageDealtToChampions: 2163,
    damageDealtToObjectives: 11240,
    damageDealtToTurrets: 2310,
    totalDamageTaken: 31540,
    damageSelfMitigated: 18600,
    visionScore: 30,
    wardsPlaced: 8,
    wardsKilled: 2,
    visionWardsBoughtInGame: 2,
    goldSpent: 11900,
    neutralMinionsKilledTeamJungle: 42,
    neutralMinionsKilledEnemyJungle: 8,
    firstBloodKill: true,
    firstTowerAssist: true,
    turretKills: 2,
    doubleKills: 1,
    largestMultiKill: 2,
    largestKillingSpree: 6,
    item0: 3078,
    item1: 3158,
    unknownFutureKey: 12345,
  });

  await writeImportedGame(final.teamBId!, {
    registrationId: a[0],
    championId: C[1],
    kills: 3,
    deaths: 4,
    assists: 5,
    cs: 190,
    damage: 14043,
    gold: 11200,
  }, {
    champLevel: 14,
    totalDamageDealtToChampions: 14043,
    physicalDamageDealtToChampions: 6500,
    magicDamageDealtToChampions: 5440,
    trueDamageDealtToChampions: 2103,
    damageDealtToObjectives: 7980,
    totalDamageTaken: 26420,
    damageSelfMitigated: 12000,
    visionScore: 34,
    wardsPlaced: 11,
    wardsKilled: 2,
    visionWardsBoughtInGame: 3,
    goldSpent: 10800,
    firstBloodAssist: true,
    turretKills: 1,
    tripleKills: 1,
    largestMultiKill: 3,
  });

  const full = (await getPlayerTournamentStats(testDb, reg.playerId, t.id, { includeRawStats: true }))!;
  expect(full.extended.sourceGames).toBe(2);
  expect(full.extended.averages.avgVisionScore).toBe(32);
  expect(full.extended.averages.avgObjectiveDamage).toBe(9610);
  expect(full.extended.totals.firstBloodKills).toBe(1);
  expect(full.extended.totals.firstBloodAssists).toBe(1);
  expect(full.extended.totals.turretKills).toBe(3);
  expect(full.extended.totals.tripleKills).toBe(1);
  expect(full.extended.totals.largestMultiKill).toBe(3);
  expect(full.extended.radar.sourceGames).toBe(2);
  expect(full.extended.trends).toHaveLength(2);
  expect(full.extended.trends[0].damagePercentile).not.toBeNull();
  const firstGame = full.games.find((g) => g.gameId === game1)!;
  expect(firstGame.extended?.spell1Id).toBe(14);
  expect(firstGame.extended?.items).toEqual([3078, 3158]);
  expect(firstGame.extended?.damageComposition).toMatchObject({
    physical: 21840,
    magic: 6420,
    trueDamage: 2163,
    total: 30423,
  });
  expect(firstGame.extended?.rawStats).toMatchObject({ unknownFutureKey: 12345 });

  const lightweight = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;
  expect(lightweight.games.find((g) => g.gameId === game1)!.extended).not.toHaveProperty('rawStats');

  const profiles = await listPlayerTournamentProfiles(testDb, t.id);
  const profile = profiles.find((p) => p.registrationId === a[0])!;
  expect(profile.games.find((g) => g.gameId === game1)!.extended).not.toHaveProperty('rawStats');
});

it('无 extStats 或字段类型异常时基础统计不变，扩展数据降级为空态', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const { gameId } = await saveGameDetail(testDb, {
    matchId: final.id,
    expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamAId,
      playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)],
    },
    actorUserId: 'u',
  });
  await testDb.gamePlayerStat.update({
    where: { gameId_registrationId: { gameId, registrationId: a[0] } },
    data: { extStats: { visionScore: 'bad', totalDamageDealtToChampions: false, firstBloodKill: true } },
  });

  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;

  expect(res.summary.games).toBe(1);
  expect(res.summary.avgDamage).toBe(15000);
  expect(res.extended.sourceGames).toBe(1);
  expect(res.extended.averages.avgVisionScore).toBeNull();
  expect(res.extended.totals.firstBloodKills).toBe(1);
  expect(res.games[0].extended?.damageComposition).toBeNull();
});

it('计算参团率、生涯纪录、最长连胜、角色标签（无 extStats 时降级）', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  await saveGameDetail(testDb, {
    matchId: final.id,
    expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamAId,
      playerStats: [...stats(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)],
      mvpRegistrationId: a[0],
    },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;

  // 全队 5 人各 3 杀 = 15；carry a[0] = 3K + 2A → KP = 5/15 = 33.3%
  expect(res.killParticipation).toBe(33.3);
  // 单场取胜 → 最长连胜 1
  expect(res.bestWinStreak).toBe(1);
  // 单场生涯纪录
  expect(res.careerHighs.maxKills?.value).toBe(3);
  expect(res.careerHighs.maxDamage?.value).toBe(15000);
  expect(res.careerHighs.maxKda?.value).toBe(5); // (3+2)/1
  // 无 extStats → 最长存活与角色标签降级为空
  expect(res.careerHighs.longestTimeSpentLiving).toBeNull();
  expect(res.roleTag).toBeNull();
});

it('参团率边界：全队 0 击杀的对局被跳过，无有效局时 KP 为 null', async () => {
  const { t, final } = await finalWithRosters();
  const a = await expandRosterTo5(t.id, final.teamAId!);
  const b = await expandRosterTo5(t.id, final.teamBId!);
  const zeroKill = (teamId: string, regs: string[], off: number) =>
    regs.map((registrationId, k) => ({
      teamId,
      registrationId,
      championId: C[(k + off) % C.length],
      kills: 0,
      deaths: 2,
      assists: 0,
      cs: 150,
      damage: 8000,
      gold: 9000,
    }));
  await saveGameDetail(testDb, {
    matchId: final.id,
    expectedVersion: final.version,
    detail: {
      winnerTeamId: final.teamBId,
      playerStats: [...zeroKill(final.teamAId!, a, 0), ...stats(final.teamBId!, b, 5)],
    },
    actorUserId: 'u',
  });
  const reg = (await testDb.registration.findUnique({ where: { id: a[0] } }))!;
  const res = (await getPlayerTournamentStats(testDb, reg.playerId, t.id))!;

  // 该选手唯一一局全队 0 击杀 → 该局被跳过 → 无有效局 → KP 为 null
  expect(res.killParticipation).toBeNull();
  expect(res.careerHighs.maxKills?.value).toBe(0);
});
