import type { Prisma, PrismaClient } from '@prisma/client';
import { championKeyByNumericId } from './champions';
import { TournamentError } from './errors';
import { saveGameDetailTx, stageTagForMatch, type BanInput } from './game-detail-service';
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

function objField<T extends string | number | boolean>(
  obj: Record<string, unknown> | undefined,
  key: string,
  kind: 'string' | 'number' | 'boolean',
): T | null {
  const v = obj?.[key];
  return typeof v === kind ? (v as T) : null;
}

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

function mappingScore(rows: MapRow[]) {
  return rows.filter((r) => r.registrationId !== null).length;
}

type ParsedSummary = ReturnType<typeof summarySchema.parse>;

function buildImportedBanPicks(
  s: ParsedSummary,
  blueTeamId: string,
  redTeamId: string,
): BanInput[] {
  const rows: Omit<BanInput, 'order'>[] = [];
  const rawTeams = Array.isArray(s.teams) ? s.teams : [];
  for (const rawTeam of rawTeams) {
    if (!rawTeam || typeof rawTeam !== 'object') continue;
    const team = rawTeam as { teamId?: unknown; bans?: unknown };
    if (team.teamId !== 100 && team.teamId !== 200) continue;
    if (!Array.isArray(team.bans)) continue;
    const siteTeamId = team.teamId === 100 ? blueTeamId : redTeamId;
    const bans = team.bans
      .map((b) => {
        const row = b as { championId?: unknown; pickTurn?: unknown };
        return {
          championId: typeof row.championId === 'number' ? row.championId : null,
          pickTurn: typeof row.pickTurn === 'number' ? row.pickTurn : Number.MAX_SAFE_INTEGER,
        };
      })
      .filter((b): b is { championId: number; pickTurn: number } => b.championId !== null)
      .sort((a, b) => a.pickTurn - b.pickTurn);
    for (const b of bans) {
      const key = championKeyByNumericId(b.championId);
      if (!key) throw new TournamentError('VALIDATION', `未知 BP 英雄 id：${b.championId}`);
      rows.push({ teamId: siteTeamId, type: 'BAN', championId: key });
    }
  }

  for (const p of s.players) {
    const key = championKeyByNumericId(p.championId);
    if (!key) throw new TournamentError('VALIDATION', `未知英雄 id：${p.championId}，请更新英雄数据`);
    rows.push({
      teamId: p.teamId === 100 ? blueTeamId : redTeamId,
      type: 'PICK',
      championId: key,
    });
  }

  return rows.map((row, i) => ({ ...row, order: i + 1 }));
}

export async function buildAutoMapping(db: Db, matchId: string, raw: unknown) {
  const match = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  if (!match.teamAId || !match.teamBId) throw new Error('比赛双方未确定');

  const aAsBlue = await buildMapping(db, matchId, match.teamAId, raw);
  const bAsBlue = await buildMapping(db, matchId, match.teamBId, raw);
  const aScore = mappingScore(aAsBlue.rows);
  const bScore = mappingScore(bAsBlue.rows);

  // 命中数相同（包括都 0）时不阻断审核：默认 teamA=蓝方，
  // 审核页仍允许切换红蓝方并手动补映射。
  if (aScore === bScore) return aAsBlue;
  return aScore > bScore ? aAsBlue : bAsBlue;
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
      if (!match.scheduledAt)
        throw new TournamentError('VALIDATION', '仅已预约的赛程可导入对局');
      if (match.status !== 'SCHEDULED')
        throw new TournamentError('CONFLICT', '仅未完成的赛程可导入对局');
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
        return {
          teamId: siteTeamId,
          registrationId: regId,
          championId: key,
          kills: st.kills ?? 0,
          deaths: st.deaths ?? 0,
          assists: st.assists ?? 0,
          cs: (st.totalMinionsKilled ?? 0) + (st.neutralMinionsKilled ?? 0),
          damage: st.totalDamageDealtToChampions ?? 0,
          gold: st.goldEarned ?? 0,
          _ext: {
            ...st,
            championId: p.championId,
            championName: p.championName,
            spell1Id: p.spell1Id,
            spell2Id: p.spell2Id,
          } as Prisma.InputJsonValue,
        };
      });
      const banPicks = buildImportedBanPicks(s, body.blueTeamId, redTeamId);

      const recordedGames = await tx.game.findMany({
        where: { matchId: match.id },
        include: { _count: { select: { bans: true, playerStats: true } } },
      });
      if (recordedGames.some((g) => !g.isDraft || g._count.bans > 0 || g._count.playerStats > 0))
        throw new TournamentError('CONFLICT', '该赛程已有录入数据');
      const stageTag = stageTagForMatch(match);

      const existing = await tx.game.findFirst({
        where: { matchId: match.id, index: body.gameIndex },
        include: { _count: { select: { bans: true, playerStats: true } } },
      });
      const count = await tx.game.count({ where: { matchId: match.id } });
      let gameIdArg: string | undefined;
      if (existing) {
        if (!existing.isDraft || existing._count.bans > 0 || existing._count.playerStats > 0)
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
          bans: banPicks,
          playerStats: playerStats.map(({ _ext, ...ps }) => ps),
        },
        actorUserId,
      });

      const rawTeams = new Map<number, Record<string, unknown>>();
      for (const t of s.teams ?? []) {
        if (t && typeof t === 'object') {
          const row = t as Record<string, unknown>;
          const teamId = objField<number>(row, 'teamId', 'number');
          if (teamId === 100 || teamId === 200) rawTeams.set(teamId, row);
        }
      }
      await tx.gameTeamStat.deleteMany({ where: { gameId } });
      for (const lcuTeamId of [100, 200] as const) {
        const rawTeam = rawTeams.get(lcuTeamId);
        const siteTeamId = lcuTeamId === 100 ? body.blueTeamId : redTeamId;
        const bans = Array.isArray(rawTeam?.bans)
          ? (rawTeam.bans as Prisma.InputJsonValue)
          : undefined;
        await tx.gameTeamStat.create({
          data: {
            gameId,
            teamId: siteTeamId,
            lcuTeamId,
            win: lcuTeamId === 100 ? winnerTeamId === body.blueTeamId : winnerTeamId === redTeamId,
            stageTag,
            firstBlood: objField<boolean>(rawTeam, 'firstBlood', 'boolean'),
            firstTower: objField<boolean>(rawTeam, 'firstTower', 'boolean'),
            firstBaron: objField<boolean>(rawTeam, 'firstBaron', 'boolean'),
            firstDragon: objField<boolean>(rawTeam, 'firstDargon', 'boolean'),
            firstInhibitor: objField<boolean>(rawTeam, 'firstInhibitor', 'boolean'),
            towerKills: objField<number>(rawTeam, 'towerKills', 'number'),
            inhibitorKills: objField<number>(rawTeam, 'inhibitorKills', 'number'),
            dragonKills: objField<number>(rawTeam, 'dragonKills', 'number'),
            baronKills: objField<number>(rawTeam, 'baronKills', 'number'),
            riftHeraldKills: objField<number>(rawTeam, 'riftHeraldKills', 'number'),
            hordeKills: objField<number>(rawTeam, 'hordeKills', 'number'),
            vilemawKills: objField<number>(rawTeam, 'vilemawKills', 'number'),
            dominionVictoryScore: objField<number>(rawTeam, 'dominionVictoryScore', 'number'),
            bans,
            extStats: rawTeam as Prisma.InputJsonValue | undefined,
          },
        });
      }

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
