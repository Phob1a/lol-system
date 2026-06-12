import type { PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritable } from './guards';
import { isChampionKey } from './champions';
import { assertDownstreamClean, claimMatch, resettleMatch } from './score-service';

export type BanInput = { teamId: string; type: 'BAN' | 'PICK'; championId: string; order: number };
export type StatInput = {
  teamId: string; registrationId: string; championId: string;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
};

/** 三态：undefined=保留 / null=清空 / value=设置（bans·stats·scalar 统一） */
export type GameDetailInput = {
  winnerTeamId?: string | null;      // undefined 保留；null 仅新建/既有草稿合法（转正后传 null 拒绝）
  blueTeamId?: string | null;
  durationSeconds?: number | null;
  mvpRegistrationId?: string | null;
  bans?: BanInput[] | null;
  playerStats?: StatInput[] | null;
};

const MAX_DURATION = 7200;

export async function saveGameDetail(
  db: PrismaClient,
  input: { matchId: string; gameId?: string; expectedVersion: number; detail: GameDetailInput; actorUserId: string },
): Promise<{ gameId: string }> {
  const d = input.detail;
  return db.$transaction(async (tx) => {
    const match = await claimMatch(tx, input.matchId, input.expectedVersion); // CAS（version+1）
    await assertSeasonWritable(tx, match.tournamentId);
    if (match.status === 'CANCELED' || match.status === 'WALKOVER')
      throw new TournamentError('INVALID_STATE', '该比赛状态不允许录入');
    if (!match.teamAId || !match.teamBId)
      throw new TournamentError('INVALID_STATE', '比赛双方未确定');

    const sides = [match.teamAId, match.teamBId];

    // —— 既有局 or 新建局 ——
    let game: { id: string; index: number; isDraft: boolean; winnerTeamId: string | null };
    if (input.gameId) {
      const existing = await tx.game.findFirst({ where: { id: input.gameId, matchId: match.id } });
      if (!existing) throw new TournamentError('VALIDATION', '该局不属于此比赛');
      game = existing;
    } else {
      const count = await tx.game.count({ where: { matchId: match.id } });
      if (count >= match.bestOf) throw new TournamentError('VALIDATION', '局数已达上限');
      game = await tx.game.create({ data: { matchId: match.id, index: count + 1, isDraft: true } });
    }

    // —— winnerTeamId 三态 + 草稿/转正 ——
    let nextWinner = game.winnerTeamId; // 默认保留
    let nextIsDraft = game.isDraft;
    if (d.winnerTeamId !== undefined) {
      if (d.winnerTeamId === null) {
        if (!game.isDraft && input.gameId)
          throw new TournamentError('VALIDATION', '已转正局不可退回草稿，清胜负请删局');
        nextWinner = null;
        nextIsDraft = true;
      } else {
        if (!sides.includes(d.winnerTeamId))
          throw new TournamentError('VALIDATION', '胜者必须是比赛双方之一');
        nextWinner = d.winnerTeamId;
        nextIsDraft = false;
      }
    }
    if (input.gameId && !game.isDraft && nextWinner === null)
      throw new TournamentError('VALIDATION', '已转正局必须有胜者');

    // 下游保护：仅当结算可能变化时触发
    //   (a) 既有局改 winner（含 null→value / draft→promoted）
    //   (b) 新增局到已结算（FINISHED）的比赛（加局 = 可能改判）
    const willChangeResult = !!input.gameId && d.winnerTeamId !== undefined && d.winnerTeamId !== game.winnerTeamId;
    const newGameOnFinished = !input.gameId && match.status === 'FINISHED';
    if (willChangeResult || newGameOnFinished) {
      await assertDownstreamClean(tx, match.id);
    }

    // —— scalar 三态：blueTeamId / durationSeconds ——
    const scalarData: Record<string, unknown> = {};
    if (d.blueTeamId !== undefined) {
      if (d.blueTeamId !== null && !sides.includes(d.blueTeamId))
        throw new TournamentError('VALIDATION', '蓝方必须是比赛双方之一');
      scalarData.blueTeamId = d.blueTeamId;
    }
    if (d.durationSeconds !== undefined) {
      if (d.durationSeconds !== null && (!Number.isInteger(d.durationSeconds) || d.durationSeconds < 1 || d.durationSeconds > MAX_DURATION))
        throw new TournamentError('VALIDATION', `时长须在 1..${MAX_DURATION} 秒`);
      scalarData.durationSeconds = d.durationSeconds;
    }

    // —— bans 三态 ——
    if (d.bans !== undefined) {
      await tx.gameBanPick.deleteMany({ where: { gameId: game.id } });
      if (d.bans !== null) {
        validateBans(d.bans, sides);
        for (const b of d.bans)
          await tx.gameBanPick.create({ data: { gameId: game.id, teamId: b.teamId, type: b.type, championId: b.championId, order: b.order } });
      }
    }

    // —— playerStats 三态（清空连带 mvp）——
    let statsClearedMvp = false;
    if (d.playerStats !== undefined) {
      await tx.gamePlayerStat.deleteMany({ where: { gameId: game.id } });
      if (d.playerStats === null) {
        statsClearedMvp = true;
      } else {
        validateStats(d.playerStats, match.teamAId, match.teamBId);
        for (const s of d.playerStats) {
          const inSnapshot = await tx.tournamentTeamPlayer.findFirst({
            where: { registrationId: s.registrationId, tournamentTeam: { tournamentId: match.tournamentId, teamId: s.teamId } },
          });
          if (!inSnapshot) throw new TournamentError('VALIDATION', '选手不在该队参赛名单快照');
          await tx.gamePlayerStat.create({ data: { gameId: game.id, ...s } });
        }
      }
    }

    // —— mvp 三态 + 规则（完整 stats 且 ∈10 人）——
    const mvpData: Record<string, unknown> = {};
    if (statsClearedMvp) {
      mvpData.mvpRegistrationId = null;
    } else if (d.mvpRegistrationId !== undefined) {
      if (d.mvpRegistrationId === null) {
        mvpData.mvpRegistrationId = null;
      } else {
        const statCount = await tx.gamePlayerStat.count({ where: { gameId: game.id } });
        if (statCount !== 10) throw new TournamentError('VALIDATION', 'MVP 需该局双方数据完整（各 5 人）');
        const isPlayer = await tx.gamePlayerStat.findFirst({ where: { gameId: game.id, registrationId: d.mvpRegistrationId } });
        if (!isPlayer) throw new TournamentError('VALIDATION', 'MVP 必须是该局 10 人之一');
        mvpData.mvpRegistrationId = d.mvpRegistrationId;
      }
    }

    // —— 落库 game 标量 ——
    await tx.game.update({
      where: { id: game.id },
      data: { winnerTeamId: nextWinner, isDraft: nextIsDraft, ...scalarData, ...mvpData },
    });

    // —— 重算系列赛结果 + 决赛 FINISHED hook（Task 2）——
    await resettleMatch(tx, match.id);

    await writeAudit(tx, {
      userId: input.actorUserId, action: 'match.game.detail',
      entity: 'Game', entityId: game.id,
      payload: { matchId: match.id, gameIndex: game.index, isDraft: nextIsDraft },
    });
    return { gameId: game.id };
  });
}

function validateBans(bans: BanInput[], sides: string[]): void {
  const orders = bans.map((b) => b.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++)
    if (orders[i] !== i + 1) throw new TournamentError('VALIDATION', 'BP 顺序须从 1 连续递增');
  const champ = new Set<string>();
  for (const b of bans) {
    if (!sides.includes(b.teamId)) throw new TournamentError('VALIDATION', 'BP 队伍必须是比赛双方之一');
    if (b.type !== 'BAN' && b.type !== 'PICK') throw new TournamentError('VALIDATION', 'BP 类型非法');
    if (!isChampionKey(b.championId)) throw new TournamentError('VALIDATION', `英雄不存在：${b.championId}`);
    if (champ.has(b.championId)) throw new TournamentError('VALIDATION', '同局英雄不可重复');
    champ.add(b.championId);
  }
}

function validateStats(stats: StatInput[], teamAId: string, teamBId: string): void {
  const aCount = stats.filter((s) => s.teamId === teamAId).length;
  const bCount = stats.filter((s) => s.teamId === teamBId).length;
  if (stats.length !== 10 || aCount !== 5 || bCount !== 5)
    throw new TournamentError('VALIDATION', '选手数据须双方各 5 条');
  const regs = new Set<string>();
  for (const s of stats) {
    if (s.teamId !== teamAId && s.teamId !== teamBId)
      throw new TournamentError('VALIDATION', '选手队伍必须是比赛双方之一');
    if (regs.has(s.registrationId)) throw new TournamentError('VALIDATION', '同局选手不可重复');
    regs.add(s.registrationId);
    if (!isChampionKey(s.championId)) throw new TournamentError('VALIDATION', `英雄不存在：${s.championId}`);
    for (const v of [s.kills, s.deaths, s.assists, s.cs, s.damage, s.gold])
      if (!Number.isInteger(v) || v < 0) throw new TournamentError('VALIDATION', '数据须为非负整数');
  }
}
