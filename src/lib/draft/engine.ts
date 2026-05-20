import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { POSITIONS } from '@/lib/players/schema';
import { pickCaptainSlot } from '@/lib/teams/preview';
import type { DraftSnapshot, DraftTeamSnapshot, RegistrationRef } from './types';

export class DraftStateError extends Error {
  constructor(public readonly code: DraftStateErrorCode, message: string) {
    super(message);
    this.name = 'DraftStateError';
  }
}

/** All error codes the draft engine can raise. */
export type DraftStateErrorCode =
  | 'WRONG_SEASON_STATE'
  | 'NO_SEASON'
  | 'ALREADY_RUNNING'
  | 'NO_CAPTAINS'
  | 'NO_SESSION'
  | 'NO_MORE_ROUNDS'
  | 'ROUND_ACTIVE'
  | 'NO_PREV_ROUND'
  | 'MISSING_ASSIGNMENT'
  | 'EXTRA_ASSIGNMENT'
  | 'STALE_SEQ'
  | 'NOT_ON_CLOCK'
  | 'NO_ACTIVE_ROUND'
  | 'NO_REGISTRATION'
  | 'REGISTRATION_EXCLUDED'
  | 'PLAYER_IS_CAPTAIN'
  | 'NO_TEAM'
  | 'INSUFFICIENT_BUDGET'
  | 'NO_SLOT'
  | 'SLOT_OCCUPIED'
  | 'ALREADY_PICKED'
  | 'NO_PICK'
  | 'ALREADY_REVOKED'
  | 'NO_ROUND_TO_REWIND'
  | 'NO_ROUND'
  | 'INVALID_POSITIONS'
  | 'PLAYER_SET_MISMATCH';

/**
 * Start the draft for a season.
 *
 * Transactional contract:
 *   - Refuses unless the season is ROSTER_LOCKED.
 *   - Refuses if a session is already IN_PROGRESS (idempotent guard).
 *   - Creates one DraftSession (status=IN_PROGRESS, currentRound=0, seq=1).
 *   - Teams already exist (created at captain appointment). For each team,
 *     sets budgetLeft = season.teamBudget - captain.cost, creates 5 TeamSlots,
 *     and auto-places the captain in the slot matching the first of their
 *     primaryPositions in enum order.
 *   - Transitions the season to DRAFTING.
 *   - Appends DRAFT_STARTED event with seq=1.
 *
 * @returns the freshly-created session id
 */
export async function startDraft(
  seasonId: string,
  actorUserId: string,
): Promise<{ sessionId: string }> {
  return prisma.$transaction(async (tx) => {
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new DraftStateError('NO_SEASON', '赛季不存在');
    if (season.status !== 'ROSTER_LOCKED') {
      throw new DraftStateError('WRONG_SEASON_STATE', '赛季未处于名册锁定阶段');
    }

    const existing = await tx.draftSession.findFirst({
      where: { seasonId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      throw new DraftStateError('ALREADY_RUNNING', '已有进行中的选秀');
    }

    const captains = await tx.registration.findMany({
      where: { seasonId, isCaptain: true, status: 'ACTIVE' },
    });
    if (captains.length === 0) {
      throw new DraftStateError('NO_CAPTAINS', '至少需要一名现役队长才能开启选秀');
    }

    const session = await tx.draftSession.create({
      data: {
        seasonId,
        status: 'IN_PROGRESS',
        currentRound: 0,
        seq: 1,
        startedAt: new Date(),
      },
    });

    // Teams already exist (created at captain appointment). Initialize each:
    // set budget, create slots, place the captain.
    const teams = await tx.team.findMany({
      where: { seasonId },
      include: { captain: true },
    });
    for (const team of teams) {
      const captainSlot = pickCaptainSlot(team.captain);
      await tx.team.update({
        where: { id: team.id },
        data: { budgetLeft: season.teamBudget - team.captain.cost },
      });
      // Create 5 slots; captain occupies the matching one.
      await tx.teamSlot.createMany({
        data: POSITIONS.map((pos) => ({
          teamId: team.id,
          position: pos,
          registrationId: pos === captainSlot ? team.captainId : null,
        })),
      });
    }

    await tx.draftEvent.create({
      data: {
        sessionId: session.id,
        type: 'DRAFT_STARTED',
        actorId: actorUserId,
        seq: 1,
        payload: {
          captainCount: captains.length,
          teamBudget: season.teamBudget,
        },
      },
    });

    await tx.season.update({
      where: { id: seasonId },
      data: { status: 'DRAFTING' },
    });

    return { sessionId: session.id };
  });
}

/**
 * Reset the draft for a season.
 *
 * Wipes the season's DraftSession / DraftRound / DraftPick / DraftEvent records
 * (cascade), deletes the season's TeamSlot rows, and resets each
 * Team.budgetLeft to 0. Teams themselves, Registrations, Players and Users are
 * preserved. The season is moved back to ROSTER_LOCKED so the admin can restart.
 *
 * Note: this is destructive by design. The audit trail of the just-deleted
 * draft is not preserved. Per the planner R1 discussion, reset is the "nuke
 * everything" operation; revoke/rewind are the surgical alternatives.
 */
export async function resetDraft(seasonId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // DraftSession cascades to rounds/picks/events via Prisma onDelete: Cascade.
    // Scoped to this season's single session (seasonId is @unique on DraftSession).
    await tx.draftSession.deleteMany({ where: { seasonId } });

    // Delete all slot rows for the season's teams so startDraft can re-create them.
    await tx.teamSlot.deleteMany({ where: { team: { seasonId } } });
    await tx.team.updateMany({
      where: { seasonId },
      data: { budgetLeft: 0 },
    });

    await tx.season.update({
      where: { id: seasonId },
      data: { status: 'ROSTER_LOCKED' },
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// Read snapshot
// ──────────────────────────────────────────────────────────────────────

const registrationRefSelect = {
  id: true,
  nickname: true,
  primaryPositions: true,
  secondaryPositions: true,
  cost: true,
  player: { select: { gameId: true } },
} satisfies Prisma.RegistrationSelect;

type RegistrationRow = Prisma.RegistrationGetPayload<{
  select: typeof registrationRefSelect;
}>;

/** Flatten the nested player.gameId into the snapshot's RegistrationRef shape. */
function toRegistrationRef(r: RegistrationRow): RegistrationRef {
  return {
    id: r.id,
    nickname: r.nickname,
    gameId: r.player.gameId,
    primaryPositions: r.primaryPositions,
    secondaryPositions: r.secondaryPositions,
    cost: r.cost,
  };
}

export async function getDraftSnapshot(seasonId: string): Promise<DraftSnapshot> {
  const session = await prisma.draftSession.findFirst({
    where: { seasonId, status: { in: ['IN_PROGRESS', 'FINISHED'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    return {
      session: null,
      teams: [],
      pickedRegistrationIds: [],
      picks: [],
      seq: 0,
    };
  }

  const teams = await prisma.team.findMany({
    where: { seasonId },
    include: {
      captain: { select: registrationRefSelect },
      slots: { include: { registration: { select: registrationRefSelect } } },
    },
  });

  const teamSnapshots: DraftTeamSnapshot[] = teams.map((team) => ({
    id: team.id,
    captainId: team.captainId,
    captainGameId: team.captain.player.gameId,
    captainNickname: team.captain.nickname,
    budgetLeft: team.budgetLeft,
    slots: team.slots
      .slice()
      .sort(
        (a, b) =>
          POSITIONS.indexOf(a.position as (typeof POSITIONS)[number]) -
          POSITIONS.indexOf(b.position as (typeof POSITIONS)[number]),
      )
      .map((s) => ({
        id: s.id,
        position: s.position,
        registration: s.registration ? toRegistrationRef(s.registration) : null,
      })),
  }));

  // Picked = any registration currently occupying any slot, excluding captains
  // (captains are pre-placed; "picked" in the captain-UX sense means draft picks).
  const picked = new Set<string>();
  for (const t of teamSnapshots) {
    for (const slot of t.slots) {
      if (slot.registration && slot.registration.id !== t.captainId) {
        picked.add(slot.registration.id);
      }
    }
  }

  // Non-revoked picks for this session, ordered for the admin's revoke UI.
  const pickRows = await prisma.draftPick.findMany({
    where: { round: { sessionId: session.id }, revoked: false },
    include: { round: { select: { roundNo: true } } },
    orderBy: [{ round: { roundNo: 'asc' } }, { pickIndex: 'asc' }],
  });

  return {
    session: {
      id: session.id,
      status: session.status,
      currentRound: session.currentRound,
      onTheClock: session.onTheClock,
      seq: session.seq,
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
    },
    teams: teamSnapshots,
    pickedRegistrationIds: Array.from(picked),
    picks: pickRows.map((p) => ({
      id: p.id,
      roundNo: p.round.roundNo,
      pickIndex: p.pickIndex,
      byCaptainId: p.byCaptainId,
      teamId: p.teamId,
      registrationId: p.registrationId,
      position: p.position,
      costPaid: p.costPaid,
      pickedAt: p.pickedAt.toISOString(),
    })),
    seq: session.seq,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Rounds & picks
// ──────────────────────────────────────────────────────────────────────

import type { Position, RoundMode } from '@prisma/client';
import { resolveOrder, type CaptainSnapshot } from './orderResolvers';

export const TOTAL_ROUNDS = 4;

export type ManualAssignment = {
  captainId: string;
  registrationId: string;
  position: Position;
};

export type StartRoundInput = {
  seasonId: string;
  mode: RoundMode;
  adminProvidedOrder?: string[];
  manualAssignments?: ManualAssignment[];
  actorUserId: string;
};

export type StartRoundResult = {
  roundId: string;
  roundNo: number;
  pickOrder: string[];
  finishedDraft: boolean;
};

/**
 * Start a new round.
 *
 * Modes:
 *   - MANUAL: applies all manualAssignments atomically; round advances to DONE
 *     in the same transaction. If this is round TOTAL_ROUNDS, the session
 *     transitions to FINISHED.
 *   - ADMIN_ORDER / REVERSE_LAST / BUDGET_DESC: round becomes ACTIVE; first
 *     captain in the resolved order is on the clock. Picks come via
 *     submitPick() one at a time.
 *
 * Sequence numbers: ROUND_STARTED gets seq=N+1; each MANUAL pick that follows
 * gets seq=N+2, +3, etc. After the transaction, session.seq is the highest
 * used seq value.
 */
export async function startRound(input: StartRoundInput): Promise<StartRoundResult> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.draftSession.findFirst({ where: { seasonId: input.seasonId, status: 'IN_PROGRESS' } });
    if (!session) throw new DraftStateError('NO_SESSION', '没有进行中的选秀');

    const nextRoundNo = session.currentRound + 1;
    if (nextRoundNo > TOTAL_ROUNDS) {
      throw new DraftStateError('NO_MORE_ROUNDS', `已达到 ${TOTAL_ROUNDS} 轮上限`);
    }

    const activeRound = await tx.draftRound.findFirst({
      where: { sessionId: session.id, status: 'ACTIVE' },
    });
    if (activeRound) {
      throw new DraftStateError('ROUND_ACTIVE', '上一轮尚未结束');
    }

    const teams = await tx.team.findMany({
      where: { seasonId: session.seasonId },
      select: { id: true, captainId: true, budgetLeft: true },
    });
    const captains: CaptainSnapshot[] = teams.map((t) => ({
      id: t.captainId,
      budgetLeft: t.budgetLeft,
    }));

    let prevRoundOrder: string[] | undefined;
    if (input.mode === 'REVERSE_LAST') {
      const prev = await tx.draftRound.findFirst({
        where: { sessionId: session.id, roundNo: session.currentRound },
      });
      if (!prev) {
        throw new DraftStateError('NO_PREV_ROUND', '首轮无法使用 REVERSE_LAST 模式');
      }
      prevRoundOrder = prev.pickOrder as string[];
    }

    const order = resolveOrder({
      mode: input.mode,
      captains,
      prevRoundOrder,
      adminProvidedOrder: input.adminProvidedOrder,
    });

    const round = await tx.draftRound.create({
      data: {
        sessionId: session.id,
        roundNo: nextRoundNo,
        mode: input.mode,
        pickOrder: order,
        status: 'ACTIVE',
      },
    });

    let currentSeq = session.seq + 1;
    await tx.draftEvent.create({
      data: {
        sessionId: session.id,
        type: 'ROUND_STARTED',
        actorId: input.actorUserId,
        seq: currentSeq,
        payload: { roundId: round.id, roundNo: nextRoundNo, mode: input.mode, pickOrder: order },
      },
    });

    let onTheClockUpdate: string | null;
    let finishedDraft = false;
    let roundStatusFinal: 'ACTIVE' | 'DONE' = 'ACTIVE';

    if (input.mode === 'MANUAL') {
      // Validate assignments
      const assignments = input.manualAssignments ?? [];
      const assignedSet = new Set(assignments.map((a) => a.captainId));
      for (const cid of order) {
        if (!assignedSet.has(cid)) {
          throw new DraftStateError('MISSING_ASSIGNMENT', `缺少队长 ${cid} 的指派`);
        }
      }
      if (assignments.length !== order.length) {
        throw new DraftStateError(
          'EXTRA_ASSIGNMENT',
          `指派数量 ${assignments.length} 与队长数量 ${order.length} 不一致`,
        );
      }

      for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        await applyPick(tx, {
          sessionId: session.id,
          round,
          pickIndex: i,
          captainId: a.captainId,
          registrationId: a.registrationId,
          position: a.position,
          actorUserId: input.actorUserId,
          seq: ++currentSeq,
        });
      }

      // Round done
      await tx.draftRound.update({ where: { id: round.id }, data: { status: 'DONE' } });
      roundStatusFinal = 'DONE';
      onTheClockUpdate = null;
      finishedDraft = nextRoundNo >= TOTAL_ROUNDS;
    } else {
      onTheClockUpdate = order[0] ?? null;
    }

    await tx.draftSession.update({
      where: { id: session.id },
      data: {
        currentRound: nextRoundNo,
        seq: currentSeq,
        onTheClock: onTheClockUpdate,
        ...(finishedDraft && { status: 'FINISHED', finishedAt: new Date() }),
      },
    });

    if (finishedDraft) {
      await tx.season.update({ where: { id: session.seasonId }, data: { status: 'COMPLETED' } });
    }

    void roundStatusFinal;

    return { roundId: round.id, roundNo: nextRoundNo, pickOrder: order, finishedDraft };
  });
}

export type SubmitPickInput = {
  seasonId: string;
  byCaptainId: string;
  registrationId: string;
  position: Position;
  expectedSeq: number;
  actorUserId: string;
};

export type SubmitPickResult = {
  pickId: string;
  finishedRound: boolean;
  finishedDraft: boolean;
  newSeq: number;
};

/**
 * Apply one captain's pick.
 *
 * Concurrency model: the transaction takes a row lock on the DraftSession via
 * SELECT ... FOR UPDATE. The expectedSeq guard (client-supplied) catches stale
 * UI submissions that won the lock race but were issued before the most recent
 * state change. STALE_SEQ → 409 on the route layer; client refetches.
 */
export async function submitPick(input: SubmitPickInput): Promise<SubmitPickResult> {
  return prisma.$transaction(async (tx) => {
    // Row lock on the in-progress session, scoped to this season.
    const locked = await tx.$queryRaw<{ id: string; seq: number; on_the_clock: string | null; current_round: number }[]>`
      SELECT id, seq, "onTheClock" AS on_the_clock, "currentRound" AS current_round
      FROM "draft_sessions"
      WHERE "seasonId" = ${input.seasonId} AND status = 'IN_PROGRESS'
      FOR UPDATE
    `;
    if (locked.length === 0) throw new DraftStateError('NO_SESSION', '没有进行中的选秀');
    const lockedSession = locked[0];

    if (lockedSession.seq !== input.expectedSeq) {
      throw new DraftStateError('STALE_SEQ', '状态已变更，请刷新');
    }
    if (lockedSession.on_the_clock !== input.byCaptainId) {
      throw new DraftStateError('NOT_ON_CLOCK', '当前未轮到该队长');
    }

    const round = await tx.draftRound.findFirst({
      where: { sessionId: lockedSession.id, roundNo: lockedSession.current_round, status: 'ACTIVE' },
    });
    if (!round) throw new DraftStateError('NO_ACTIVE_ROUND', '当前轮次未激活');

    const pickIndex = await tx.draftPick.count({
      where: { roundId: round.id, revoked: false },
    });

    const newSeq = lockedSession.seq + 1;
    const pickResult = await applyPick(tx, {
      sessionId: lockedSession.id,
      round,
      pickIndex,
      captainId: input.byCaptainId,
      registrationId: input.registrationId,
      position: input.position,
      actorUserId: input.actorUserId,
      seq: newSeq,
    });

    // Advance on-the-clock
    const order = round.pickOrder as string[];
    const idx = order.indexOf(input.byCaptainId);
    const nextIdx = idx + 1;
    let nextOnClock: string | null;
    let finishedRound = false;
    let finishedDraft = false;
    if (nextIdx < order.length) {
      nextOnClock = order[nextIdx];
    } else {
      // Round done
      nextOnClock = null;
      finishedRound = true;
      await tx.draftRound.update({ where: { id: round.id }, data: { status: 'DONE' } });
      if (lockedSession.current_round >= TOTAL_ROUNDS) {
        finishedDraft = true;
      }
    }

    await tx.draftSession.update({
      where: { id: lockedSession.id },
      data: {
        seq: newSeq,
        onTheClock: nextOnClock,
        ...(finishedDraft && { status: 'FINISHED', finishedAt: new Date() }),
      },
    });

    if (finishedDraft) {
      const sess = await tx.draftSession.findUnique({ where: { id: lockedSession.id }, select: { seasonId: true } });
      if (sess) {
        await tx.season.update({ where: { id: sess.seasonId }, data: { status: 'COMPLETED' } });
      }
    }

    return { pickId: pickResult.pickId, finishedRound, finishedDraft, newSeq };
  });
}

// ──────────────────────────────────────────────────────────────────────
// Internal: apply a single pick (validates eligibility, writes pick + slot
// + budget + event). Used by both submitPick and MANUAL startRound.
// Returns pick id so caller can plug into broader response.
// ──────────────────────────────────────────────────────────────────────

type ApplyPickArgs = {
  sessionId: string;
  round: { id: string; pickOrder: Prisma.JsonValue };
  pickIndex: number;
  captainId: string;
  registrationId: string;
  position: Position;
  actorUserId: string;
  seq: number;
};

async function applyPick(
  tx: Prisma.TransactionClient,
  args: ApplyPickArgs,
): Promise<{ pickId: string }> {
  const registration = await tx.registration.findUnique({ where: { id: args.registrationId } });
  if (!registration) {
    throw new DraftStateError('NO_REGISTRATION', `报名不存在: ${args.registrationId}`);
  }
  if (registration.status === 'EXCLUDED') {
    throw new DraftStateError('REGISTRATION_EXCLUDED', `选手已被排除: ${args.registrationId}`);
  }
  if (registration.isCaptain) {
    throw new DraftStateError('PLAYER_IS_CAPTAIN', `队长不可被选: ${args.registrationId}`);
  }

  const team = await tx.team.findUnique({ where: { captainId: args.captainId } });
  if (!team) throw new DraftStateError('NO_TEAM', `队长无对应战队: ${args.captainId}`);

  if (team.budgetLeft < registration.cost) {
    throw new DraftStateError(
      'INSUFFICIENT_BUDGET',
      `预算不足: 剩余 ${team.budgetLeft} < 需要 ${registration.cost}`,
    );
  }

  const slot = await tx.teamSlot.findUnique({
    where: { teamId_position: { teamId: team.id, position: args.position } },
  });
  if (!slot) throw new DraftStateError('NO_SLOT', `位置不存在: ${args.position}`);
  if (slot.registrationId) throw new DraftStateError('SLOT_OCCUPIED', `位置 ${args.position} 已被占用`);

  // Registration must not already be picked elsewhere in this draft.
  const already = await tx.draftPick.findFirst({
    where: {
      round: { sessionId: args.sessionId },
      registrationId: args.registrationId,
      revoked: false,
    },
  });
  if (already) throw new DraftStateError('ALREADY_PICKED', `选手已被选: ${args.registrationId}`);

  const pick = await tx.draftPick.create({
    data: {
      roundId: args.round.id,
      pickIndex: args.pickIndex,
      byCaptainId: args.captainId,
      teamId: team.id,
      registrationId: args.registrationId,
      position: args.position,
      costPaid: registration.cost,
    },
  });

  await tx.teamSlot.update({
    where: { id: slot.id },
    data: { registrationId: args.registrationId },
  });

  await tx.team.update({
    where: { id: team.id },
    data: { budgetLeft: team.budgetLeft - registration.cost },
  });

  await tx.draftEvent.create({
    data: {
      sessionId: args.sessionId,
      type: 'PICK_MADE',
      actorId: args.actorUserId,
      seq: args.seq,
      payload: {
        roundId: args.round.id,
        pickIndex: args.pickIndex,
        byCaptainId: args.captainId,
        registrationId: args.registrationId,
        position: args.position,
        costPaid: registration.cost,
      },
    },
  });

  return { pickId: pick.id };
}

// ──────────────────────────────────────────────────────────────────────
// Revoke / Rewind / Rearrange
// ──────────────────────────────────────────────────────────────────────

export type RevokePickResult = {
  revokedCount: number;
  newOnTheClock: string | null;
  newCurrentRound: number;
  newSeq: number;
};

/**
 * Cascade-revoke a single captain's pick.
 *
 * Effect (per the user's R1 decision):
 *   - All picks in the same round with pickIndex >= P.pickIndex are soft-revoked
 *     (revoked=true, slot freed, budget refunded).
 *   - All rounds with roundNo > P.roundNo are hard-deleted (their picks are
 *     audit-recorded via PICK_MADE events; rows go away with the round).
 *   - Round P stays ACTIVE; session.currentRound = P.roundNo;
 *     session.onTheClock = P.byCaptainId; status = IN_PROGRESS.
 *   - The frozen pickOrder of round P is preserved; Mode 4 (BUDGET_DESC) is
 *     NOT recomputed (per user decision A in R1).
 */
export async function revokePick(pickId: string, actorUserId: string): Promise<RevokePickResult> {
  return prisma.$transaction(async (tx) => {
    const pick = await tx.draftPick.findUnique({
      where: { id: pickId },
      include: { round: true },
    });
    if (!pick) throw new DraftStateError('NO_PICK', '没有该 pick');
    if (pick.revoked) throw new DraftStateError('ALREADY_REVOKED', '该 pick 已被撤销');

    const session = await tx.draftSession.findUnique({ where: { id: pick.round.sessionId } });
    if (!session) throw new DraftStateError('NO_SESSION', 'session 不存在');

    const roundNoR = pick.round.roundNo;
    const pickIndexI = pick.pickIndex;

    // 1. Soft-revoke picks in same round at index >= I (in pickIndex desc order
    //    so refunds replay in reverse — the order doesn't matter since we sum,
    //    but it documents intent: "undo what was done, latest first").
    const sameRound = await tx.draftPick.findMany({
      where: { roundId: pick.roundId, pickIndex: { gte: pickIndexI }, revoked: false },
      orderBy: { pickIndex: 'desc' },
    });
    for (const p of sameRound) {
      await tx.teamSlot.updateMany({
        where: { teamId: p.teamId, position: p.position },
        data: { registrationId: null },
      });
      await tx.team.update({
        where: { id: p.teamId },
        data: { budgetLeft: { increment: p.costPaid } },
      });
      await tx.draftPick.update({
        where: { id: p.id },
        data: { revoked: true, revokedAt: new Date() },
      });
    }

    // 2. Later rounds: free slots + refund, then delete the round (cascades picks).
    const laterRounds = await tx.draftRound.findMany({
      where: { sessionId: session.id, roundNo: { gt: roundNoR } },
      include: { picks: { where: { revoked: false } } },
    });
    let laterRevoked = 0;
    for (const lr of laterRounds) {
      for (const p of lr.picks) {
        await tx.teamSlot.updateMany({
          where: { teamId: p.teamId, position: p.position },
          data: { registrationId: null },
        });
        await tx.team.update({
          where: { id: p.teamId },
          data: { budgetLeft: { increment: p.costPaid } },
        });
        laterRevoked += 1;
      }
      await tx.draftRound.delete({ where: { id: lr.id } });
    }

    // 3. Round R back to ACTIVE; session restored.
    await tx.draftRound.update({
      where: { id: pick.roundId },
      data: { status: 'ACTIVE' },
    });

    const newSeq = session.seq + 1;
    await tx.draftSession.update({
      where: { id: session.id },
      data: {
        seq: newSeq,
        currentRound: roundNoR,
        onTheClock: pick.byCaptainId,
        status: 'IN_PROGRESS',
        finishedAt: null,
      },
    });

    await tx.season.update({ where: { id: session.seasonId }, data: { status: 'DRAFTING' } });

    await tx.draftEvent.create({
      data: {
        sessionId: session.id,
        type: 'PICK_REVOKED',
        actorId: actorUserId,
        seq: newSeq,
        payload: {
          pickId,
          roundNo: roundNoR,
          pickIndex: pickIndexI,
          captainId: pick.byCaptainId,
          revokedSameRound: sameRound.length,
          revokedLaterRounds: laterRevoked,
          deletedRoundsCount: laterRounds.length,
        },
      },
    });

    return {
      revokedCount: sameRound.length + laterRevoked,
      newOnTheClock: pick.byCaptainId,
      newCurrentRound: roundNoR,
      newSeq,
    };
  });
}

/**
 * Rewind to the end of the previous round.
 * Hard-deletes the entire current round (cascades its picks), refunds budgets,
 * frees slots, decrements currentRound, clears onTheClock, returns to IN_PROGRESS.
 */
export async function rewindRound(seasonId: string, actorUserId: string): Promise<{ newSeq: number; newCurrentRound: number }> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.draftSession.findFirst({
      where: { seasonId, status: { in: ['IN_PROGRESS', 'FINISHED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) throw new DraftStateError('NO_SESSION', '没有进行中的选秀');
    if (session.currentRound < 1) {
      throw new DraftStateError('NO_ROUND_TO_REWIND', '尚未启动任何轮次');
    }

    const round = await tx.draftRound.findFirst({
      where: { sessionId: session.id, roundNo: session.currentRound },
      include: { picks: { where: { revoked: false } } },
    });
    if (!round) throw new DraftStateError('NO_ROUND', '当前轮次不存在');

    for (const p of round.picks) {
      await tx.teamSlot.updateMany({
        where: { teamId: p.teamId, position: p.position },
        data: { registrationId: null },
      });
      await tx.team.update({
        where: { id: p.teamId },
        data: { budgetLeft: { increment: p.costPaid } },
      });
    }
    await tx.draftRound.delete({ where: { id: round.id } });

    const newCurrentRound = session.currentRound - 1;
    const newSeq = session.seq + 1;
    await tx.draftSession.update({
      where: { id: session.id },
      data: {
        seq: newSeq,
        currentRound: newCurrentRound,
        onTheClock: null,
        status: 'IN_PROGRESS',
        finishedAt: null,
      },
    });

    await tx.season.update({ where: { id: session.seasonId }, data: { status: 'DRAFTING' } });

    await tx.draftEvent.create({
      data: {
        sessionId: session.id,
        type: 'ROUND_REWOUND',
        actorId: actorUserId,
        seq: newSeq,
        payload: {
          fromRoundNo: session.currentRound,
          toRoundNo: newCurrentRound,
          revokedCount: round.picks.length,
        },
      },
    });

    return { newSeq, newCurrentRound };
  });
}

/**
 * Rearrange a team's slots (captain drag-and-drop or admin assist).
 *
 * Validation:
 *   - The set of (registration ids placed in non-null slots) in `desired` must
 *     equal the set of (registration ids currently placed in this team's slots).
 *     I.e. no adding, removing, or swapping with another team.
 *   - Every Position must appear exactly once.
 *
 * The captain itself can be moved between slots; nothing prevents it.
 */
export type SlotDesiredEntry = { position: Position; registrationId: string | null };

export async function rearrangeSlots(
  teamId: string,
  desired: SlotDesiredEntry[],
  actorUserId: string,
): Promise<{ newSeq: number }> {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: teamId },
      include: { slots: true },
    });
    if (!team) throw new DraftStateError('NO_TEAM', '战队不存在');

    const session = await tx.draftSession.findFirst({
      where: { seasonId: team.seasonId, status: { in: ['IN_PROGRESS', 'FINISHED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) throw new DraftStateError('NO_SESSION', '没有进行中的选秀');

    // Validate position set
    const desiredPositions = desired.map((d) => d.position);
    if (new Set(desiredPositions).size !== POSITIONS.length) {
      throw new DraftStateError('INVALID_POSITIONS', '位置集合必须为完整 5 个');
    }
    for (const pos of POSITIONS) {
      if (!desiredPositions.includes(pos as Position)) {
        throw new DraftStateError('INVALID_POSITIONS', `缺少位置 ${pos}`);
      }
    }

    // Validate registration set is a permutation of the current slot
    // registrations (nulls included)
    const currentRegistrationIds = team.slots
      .map((s) => s.registrationId)
      .filter((x): x is string => x != null)
      .sort();
    const desiredRegistrationIds = desired
      .map((d) => d.registrationId)
      .filter((x): x is string => x != null)
      .sort();
    if (
      currentRegistrationIds.length !== desiredRegistrationIds.length ||
      currentRegistrationIds.some((id, i) => id !== desiredRegistrationIds[i])
    ) {
      throw new DraftStateError('PLAYER_SET_MISMATCH', '调整后的选手集合必须与当前队伍一致');
    }

    // Apply: clear all slots first (avoid unique-violations on intermediate
    // states), then set new registrationIds. Postgres lets us update in any
    // order because there's no uniqueness constraint on (team, registration),
    // only the (teamId, position) pair which we're respecting.
    for (const slot of team.slots) {
      await tx.teamSlot.update({ where: { id: slot.id }, data: { registrationId: null } });
    }
    for (const d of desired) {
      await tx.teamSlot.update({
        where: { teamId_position: { teamId, position: d.position } },
        data: { registrationId: d.registrationId },
      });
    }

    const newSeq = session.seq + 1;
    await tx.draftSession.update({
      where: { id: session.id },
      data: { seq: newSeq },
    });

    await tx.draftEvent.create({
      data: {
        sessionId: session.id,
        type: 'SLOT_REARRANGED',
        actorId: actorUserId,
        seq: newSeq,
        payload: {
          teamId,
          desired: desired.map((d) => ({ position: d.position, registrationId: d.registrationId })),
        },
      },
    });

    return { newSeq };
  });
}
