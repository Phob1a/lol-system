import type { Prisma, PrismaClient } from '@prisma/client';
import { championKeyByNumericId } from './champions';
import { TournamentError } from './errors';
import { saveGameDetailTx } from './game-detail-service';
import { resolvePid, summarySchema, type CommitInput } from './import-schema';
import type { Db } from './types';

// ——— BigInt → string serialization (API output safe) ———

type SerializedImport<T extends { externalGameId: bigint; gameCreation: bigint | null }> = Omit<
  T,
  'externalGameId' | 'gameCreation'
> & { externalGameId: string; gameCreation: string | null };

export function serializeImport<
  T extends { externalGameId: bigint; gameCreation: bigint | null },
>(row: T): SerializedImport<T> {
  return {
    ...row,
    externalGameId: row.externalGameId.toString(),
    gameCreation: row.gameCreation?.toString() ?? null,
  } as SerializedImport<T>;
}

export async function listImports(
  db: Db,
  status?: 'PENDING' | 'COMMITTED' | 'DISCARDED',
) {
  const rows = await db.matchImport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(serializeImport);
}

export async function getImportDetail(db: Db, id: string) {
  const row = await db.matchImport.findUnique({ where: { id } });
  return row ? serializeImport(row) : null;
}

export async function discardImport(db: Db, id: string) {
  const row = await db.matchImport.findUniqueOrThrow({ where: { id } });
  if (row.status !== 'PENDING')
    throw new TournamentError('VALIDATION', '仅待处理的导入可丢弃');
  await db.matchImport.update({ where: { id }, data: { status: 'DISCARDED' } });
}

type Candidate = { registrationId: string; gameId: string; nickname: string };
type MapRow = {
  capturedParticipantId: number;
  capturedName: string;
  lcuTeamId: number;
  siteTeamId: string;
  registrationId: string | null;
  candidates: Candidate[];
};

async function rosterByTeam(db: Db, tournamentId: string, teamId: string): Promise<Candidate[]> {
  const tt = await db.tournamentTeam.findFirst({ where: { tournamentId, teamId } });
  if (!tt) return [];
  const rows = await db.tournamentTeamPlayer.findMany({
    where: { tournamentTeamId: tt.id },
    include: { registration: { include: { player: true } } },
  });
  return rows.map((p) => ({
    registrationId: p.registrationId,
    gameId: p.registration.player.gameId,
    nickname: p.registration.nickname,
  }));
}

const norm = (s: string) => s.trim().toLowerCase();

export async function buildMapping(db: Db, matchId: string, blueTeamId: string, raw: unknown) {
  const s = summarySchema.parse(raw);
  const match = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  if (![match.teamAId, match.teamBId].includes(blueTeamId))
    throw new Error('blueTeamId 不属于该对阵');
  const redTeamId = match.teamAId === blueTeamId ? match.teamBId! : match.teamAId!;
  const blue = await rosterByTeam(db, match.tournamentId, blueTeamId);
  const red = await rosterByTeam(db, match.tournamentId, redTeamId);
  const rows: MapRow[] = s.players.map((p, i) => {
    const isBlue = p.teamId === 100;
    const siteTeamId = isBlue ? blueTeamId : redTeamId;
    const candidates = isBlue ? blue : red;
    const hit = candidates.find((c) => norm(c.gameId) === norm(p.name));
    return {
      capturedParticipantId: resolvePid(p, i),
      capturedName: p.name,
      lcuTeamId: p.teamId,
      siteTeamId,
      registrationId: hit?.registrationId ?? null,
      candidates,
    };
  });
  return { matchId, blueTeamId, redTeamId, rows };
}

export function resolveImportAuth(
  bearer: string | null,
  isAdmin: boolean,
  envToken: string | undefined,
): { source: 'SCRIPT' | 'UPLOAD' } | { error: 401 } {
  if (envToken && bearer && bearer === envToken) return { source: 'SCRIPT' };
  if (isAdmin) return { source: 'UPLOAD' };
  return { error: 401 };
}

export async function ingestImport(db: Db, raw: unknown, source: 'SCRIPT' | 'UPLOAD') {
  const s = summarySchema.parse(raw);
  const dup = await db.matchImport.findFirst({
    where: { externalGameId: s.gameId, status: 'COMMITTED' },
    select: { id: true },
  });
  const row = await db.matchImport.create({
    data: {
      source,
      status: 'PENDING',
      externalGameId: s.gameId,
      gameVersion: s.gameVersion ?? null,
      gameMode: s.gameMode ?? null,
      gameType: s.gameType ?? null,
      queueId: s.queueId ?? null,
      mapId: s.mapId ?? null,
      gameCreation: s.gameCreation ?? null,
      durationSeconds: s.gameDuration ?? null,
      rawJson: raw as object,
    },
  });
  return {
    importId: row.id,
    externalGameId: row.externalGameId.toString(),
    duplicateOfCommitted: !!dup,
  };
}

/**
 * 把一局 staging 导入原子写入正式赛事结构。整个流程跑在单事务里，复用 saveGameDetailTx：
 * - 严格 LCU 阵营/人数/胜负校验（必须一边 5 人全胜、另一边 5 人全负）。
 * - 选手映射必须 10 人、不重复、且各自落在对应阵营名单。
 * - 数字 championId → DD key（未知英雄拒绝）。
 * - extStats 与 MatchImport.status/committedGameId 与 saveGameDetailTx 同事务落库。
 * - externalGameId 已 COMMITTED（并发去重，partial unique → P2002）或 gameIndex 冲突 → CONFLICT。
 */
export async function commitImport(
  db: PrismaClient,
  importId: string,
  body: CommitInput,
  actorUserId: string,
): Promise<{ gameId: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const imp = await tx.matchImport.findUniqueOrThrow({ where: { id: importId } });
      if (imp.status !== 'PENDING') throw new TournamentError('VALIDATION', '该导入已处理');
      const s = summarySchema.parse(imp.rawJson);
      const match = await tx.match.findUniqueOrThrow({ where: { id: body.matchId } });
      if (![match.teamAId, match.teamBId].includes(body.blueTeamId))
        throw new TournamentError('VALIDATION', 'blueTeamId 不属于该对阵');
      const redTeamId = match.teamAId === body.blueTeamId ? match.teamBId! : match.teamAId!;

      // —— 严格 LCU 阵营 + 胜负校验 ——
      for (const p of s.players)
        if (p.teamId !== 100 && p.teamId !== 200)
          throw new TournamentError('VALIDATION', `未知 LCU teamId：${p.teamId}`);
      const t100 = s.players.filter((p) => p.teamId === 100);
      const t200 = s.players.filter((p) => p.teamId === 200);
      if (t100.length !== 5 || t200.length !== 5)
        throw new TournamentError('VALIDATION', 'LCU 两队人数必须各 5 人');
      const allWin = (a: typeof t100) =>
        a.every((p) => (p.stats as Record<string, unknown>).win === true);
      const allLose = (a: typeof t100) =>
        a.every((p) => (p.stats as Record<string, unknown>).win === false);
      let winnerTeamId: string;
      if (allWin(t100) && allLose(t200)) winnerTeamId = body.blueTeamId;
      else if (allLose(t100) && allWin(t200)) winnerTeamId = redTeamId;
      else
        throw new TournamentError(
          'VALIDATION',
          'summary 胜负字段异常（必须一边 5 人全胜、另一边 5 人全负）',
        );

      const sideRegs = async (teamId: string) =>
        new Set(
          (await rosterByTeam(tx, match.tournamentId, teamId)).map((p) => p.registrationId),
        );
      const blueRegs = await sideRegs(body.blueTeamId);
      const redRegs = await sideRegs(redTeamId);

      const byPid = new Map(body.mappings.map((m) => [m.capturedParticipantId, m.registrationId]));
      if (new Set(body.mappings.map((m) => m.registrationId)).size !== 10)
        throw new TournamentError('VALIDATION', '选手映射重复或不足 10 人');

      const playerStats = s.players.map((p, i) => {
        const st = p.stats as Record<string, number>;
        const pid = resolvePid(p, i);
        const regId = byPid.get(pid);
        if (!regId) throw new TournamentError('VALIDATION', `选手「${p.name}」未映射`);
        const isBlue = p.teamId === 100;
        const siteTeamId = isBlue ? body.blueTeamId : redTeamId;
        if (!(isBlue ? blueRegs : redRegs).has(regId))
          throw new TournamentError('VALIDATION', `选手「${p.name}」映射到了非本阵营选手`);
        const key = championKeyByNumericId(p.championId);
        if (!key)
          throw new TournamentError('VALIDATION', `未知英雄 id：${p.championId}，请更新英雄数据`);
        const o = body.overrides?.[String(pid)] ?? {};
        return {
          teamId: siteTeamId,
          registrationId: regId,
          championId: key,
          kills: o.kills ?? st.kills ?? 0,
          deaths: o.deaths ?? st.deaths ?? 0,
          assists: o.assists ?? st.assists ?? 0,
          cs: o.cs ?? ((st.totalMinionsKilled ?? 0) + (st.neutralMinionsKilled ?? 0)),
          damage: o.damage ?? st.totalDamageDealtToChampions ?? 0,
          gold: o.gold ?? st.goldEarned ?? 0,
          _ext: {
            ...st,
            championId: p.championId,
            championName: p.championName,
            spell1Id: p.spell1Id,
            spell2Id: p.spell2Id,
          } as Prisma.InputJsonValue,
        };
      });

      const existing = await tx.game.findFirst({
        where: { matchId: match.id, index: body.gameIndex },
        include: { playerStats: { take: 1 } },
      });
      const count = await tx.game.count({ where: { matchId: match.id } });
      let gameIdArg: string | undefined;
      if (existing) {
        if (!existing.isDraft || existing.playerStats.length > 0)
          throw new TournamentError('CONFLICT', `第 ${body.gameIndex} 局已有正式数据`);
        gameIdArg = existing.id;
      } else if (body.gameIndex !== count + 1) {
        throw new TournamentError('CONFLICT', `第 ${body.gameIndex} 局不存在且非下一局`);
      }

      const { gameId } = await saveGameDetailTx(tx, {
        matchId: match.id,
        gameId: gameIdArg,
        expectedVersion: body.expectedVersion,
        detail: {
          winnerTeamId,
          blueTeamId: body.blueTeamId,
          durationSeconds: s.gameDuration ?? null,
          playerStats: playerStats.map(({ _ext, ...ps }) => ps),
        },
        actorUserId,
      });

      for (const ps of playerStats) {
        await tx.gamePlayerStat.update({
          where: { gameId_registrationId: { gameId, registrationId: ps.registrationId } },
          data: { extStats: ps._ext },
        });
      }
      await tx.matchImport.update({
        where: { id: importId },
        data: { status: 'COMMITTED', committedGameId: gameId },
      });
      return { gameId };
    });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002')
      throw new TournamentError('CONFLICT', '这局已导入过');
    throw e;
  }
}
