import type { PrismaClient } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { computeStandings } from './standings';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertTournamentWritable } from './guards';
import type { Db, GroupKnockoutConfig } from './types';

export type KnockoutSeedCandidate = {
  teamId: string;
  teamName: string;
  groupName: string;
  groupIndex: number;
  rank: number;
  seedKey: string;
  seedLabel: string;
};

export type KnockoutSeedSlot = {
  matchId: string;
  matchLabel: string | null;
  roundKey: string;
  slot: 'A' | 'B';
  teamId: string | null;
};

export type KnockoutSeedAssignment = {
  matchId: string;
  slot: 'A' | 'B';
  teamId: string;
};

export type KnockoutSeedingDraft = {
  tournamentId: string;
  candidates: KnockoutSeedCandidate[];
  slots: KnockoutSeedSlot[];
  defaultSlots: KnockoutSeedAssignment[];
};

type TransactionalDb = Db & Pick<PrismaClient, '$transaction'>;

async function loadTournamentForSeeding(db: Db, tournamentId: string) {
  return db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      stages: {
        include: {
          groups: {
            include: {
              teams: {
                include: {
                  team: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { name: 'asc' },
          },
          matches: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
}

type LoadedTournament = Awaited<ReturnType<typeof loadTournamentForSeeding>>;
type TournamentForSeeding = NonNullable<LoadedTournament>;
type LoadedMatch = TournamentForSeeding['stages'][number]['matches'][number];

function groupLetter(index: number): string {
  return 'ABCDEFGH'[index] ?? `G${index + 1}`;
}

function firstRoundKey(config: GroupKnockoutConfig): string {
  const advancing = config.groupCount * config.advancingPerGroup;
  if (advancing === 2) return 'FINAL';
  if (advancing === 4) return 'SF';
  if (advancing === 8) return 'QF';
  return 'R16';
}

function isResolvedCountedGroupMatch(match: LoadedMatch): boolean {
  return (
    !match.countsForStandings ||
    ((match.status === 'FINISHED' || match.status === 'WALKOVER') &&
      match.teamAId !== null &&
      match.teamBId !== null &&
      match.winnerTeamId !== null)
  );
}

function buildCandidates(tournament: TournamentForSeeding, config: GroupKnockoutConfig): KnockoutSeedCandidate[] {
  const groupStage = tournament.stages.find((s) => s.type === 'GROUP');
  if (!groupStage) throw new TournamentError('INVALID_STATE', '小组赛阶段不存在');

  const candidates: KnockoutSeedCandidate[] = [];
  for (let g = 0; g < groupStage.groups.length; g += 1) {
    const group = groupStage.groups[g];
    const groupMatches = groupStage.matches.filter((m) => m.groupId === group.id);
    if (groupMatches.some((m) => !isResolvedCountedGroupMatch(m))) {
      throw new TournamentError('INVALID_STATE', `${group.name} 组比赛未完成`);
    }

    const rows = computeStandings(
      group.teams.map((x) => x.teamId),
      groupMatches.map((m) => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        winnerTeamId: m.winnerTeamId,
        status: m.status,
        countsForStandings: m.countsForStandings,
      })),
    );

    for (let rank = 1; rank <= config.advancingPerGroup; rank += 1) {
      const row = rows[rank - 1];
      if (!row) throw new TournamentError('INVALID_STATE', `${group.name} 组出线名次不足`);
      if (row.tied) {
        throw new TournamentError('STANDINGS_TIED', `${group.name} 组名次并列无法出线，请安排加赛`);
      }

      const team = group.teams.find((x) => x.teamId === row.teamId)?.team;
      if (!team) throw new TournamentError('INVALID_STATE', '小组队伍快照不完整');
      candidates.push({
        teamId: row.teamId,
        teamName: team.name,
        groupName: group.name,
        groupIndex: g,
        rank,
        seedKey: `${g}-${rank}`,
        seedLabel: `${groupLetter(g)}${rank}`,
      });
    }
  }
  return candidates;
}

function buildSlots(tournament: TournamentForSeeding, config: GroupKnockoutConfig): KnockoutSeedSlot[] {
  const knockoutStage = tournament.stages.find((s) => s.type === 'KNOCKOUT');
  if (!knockoutStage) throw new TournamentError('INVALID_STATE', '淘汰赛阶段不存在');

  const roundKey = firstRoundKey(config);
  return knockoutStage.matches
    .filter((m) => m.roundKey === roundKey)
    .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'zh'))
    .flatMap((m) => [
      { matchId: m.id, matchLabel: m.label, roundKey, slot: 'A' as const, teamId: m.teamAId },
      { matchId: m.id, matchLabel: m.label, roundKey, slot: 'B' as const, teamId: m.teamBId },
    ]);
}

function buildDefaultSlots(
  tournament: TournamentForSeeding,
  config: GroupKnockoutConfig,
  candidates: KnockoutSeedCandidate[],
  slotCount: number,
): KnockoutSeedAssignment[] {
  const skeleton = groupKnockout.generate(config.groupCount * config.teamsPerGroup, config);
  const skeletonKnockout = skeleton.stages.find((s) => s.type === 'KNOCKOUT');
  const knockoutStage = tournament.stages.find((s) => s.type === 'KNOCKOUT');
  if (!skeletonKnockout || !knockoutStage) throw new TournamentError('INVALID_STATE', '淘汰赛阶段不存在');

  const dbIdBySkeletonKey = new Map<string, string>();
  for (const skeletonMatch of skeletonKnockout.matches) {
    const dbMatch = knockoutStage.matches.find(
      (m) => m.roundKey === skeletonMatch.roundKey && m.label === skeletonMatch.label,
    );
    if (!dbMatch) throw new TournamentError('INVALID_STATE', '淘汰赛骨架与库不一致');
    dbIdBySkeletonKey.set(skeletonMatch.key, dbMatch.id);
  }

  const candidateBySeedKey = new Map(candidates.map((candidate) => [candidate.seedKey, candidate]));
  const assignments = Object.entries(skeleton.seedMap).map(([seedKey, target]) => {
    const candidate = candidateBySeedKey.get(seedKey);
    const matchId = dbIdBySkeletonKey.get(target.matchKey);
    if (!candidate || !matchId) throw new TournamentError('INVALID_STATE', '淘汰赛骨架与库不一致');
    return { matchId, slot: target.slot, teamId: candidate.teamId };
  });

  if (assignments.length !== slotCount) {
    throw new TournamentError('INVALID_STATE', '淘汰赛骨架与首轮席位不一致');
  }
  return assignments;
}

export async function getKnockoutSeedingDraft(db: Db, tournamentId: string): Promise<KnockoutSeedingDraft> {
  const tournament = await loadTournamentForSeeding(db, tournamentId);
  if (!tournament) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  if (tournament.status !== 'GROUP_STAGE') {
    throw new TournamentError('INVALID_STATE', '当前状态不能进行淘汰赛排位');
  }
  await assertTournamentWritable(db, tournament.id);

  const config = groupKnockout.validate(tournament.config);
  const candidates = buildCandidates(tournament, config);
  const slots = buildSlots(tournament, config);
  const defaultSlots = buildDefaultSlots(tournament, config, candidates, slots.length);

  return {
    tournamentId: tournament.id,
    candidates,
    slots,
    defaultSlots,
  };
}

function slotKey(slot: Pick<KnockoutSeedAssignment, 'matchId' | 'slot'>): string {
  return `${slot.matchId}:${slot.slot}`;
}

function validateSeedAssignments(
  draft: KnockoutSeedingDraft,
  submittedSlots: KnockoutSeedAssignment[],
): KnockoutSeedAssignment[] {
  const expectedSlotKeys = new Set(draft.slots.map(slotKey));
  const submittedByKey = new Map<string, KnockoutSeedAssignment>();
  for (const submitted of submittedSlots) {
    const key = slotKey(submitted);
    if (submittedByKey.has(key)) throw new TournamentError('VALIDATION', '淘汰赛席位重复提交');
    submittedByKey.set(key, submitted);
  }

  for (const key of submittedByKey.keys()) {
    if (!expectedSlotKeys.has(key)) throw new TournamentError('VALIDATION', '淘汰赛席位不属于首轮');
  }
  for (const key of expectedSlotKeys) {
    if (!submittedByKey.has(key)) throw new TournamentError('VALIDATION', '淘汰赛席位未覆盖');
  }

  const qualifiedTeamIds = new Set(draft.candidates.map((candidate) => candidate.teamId));
  for (const submitted of submittedSlots) {
    if (!qualifiedTeamIds.has(submitted.teamId)) {
      throw new TournamentError('TEAM_NOT_IN_TOURNAMENT', '只能分配已出线队伍');
    }
  }

  const seenTeamIds = new Set<string>();
  for (const submitted of submittedSlots) {
    if (seenTeamIds.has(submitted.teamId)) throw new TournamentError('VALIDATION', '出线队伍重复分配');
    seenTeamIds.add(submitted.teamId);
  }

  return draft.slots.map((slot) => submittedByKey.get(slotKey(slot))!);
}

async function assertFirstRoundMatchesPristine(db: Db, draft: KnockoutSeedingDraft): Promise<void> {
  const matchIds = [...new Set(draft.slots.map((slot) => slot.matchId))];
  const matches = await db.match.findMany({
    where: { id: { in: matchIds } },
    include: { _count: { select: { games: true } } },
  });
  if (matches.length !== matchIds.length) {
    throw new TournamentError('INVALID_STATE', '淘汰赛首轮比赛已开始或已被修改，不能重新排位');
  }

  for (const match of matches) {
    if (
      match.status !== 'SCHEDULED' ||
      match.teamAId !== null ||
      match.teamBId !== null ||
      match.winnerTeamId !== null ||
      match._count.games > 0
    ) {
      throw new TournamentError('INVALID_STATE', '淘汰赛首轮比赛已开始或已被修改，不能重新排位');
    }
  }
}

async function claimKnockoutSeedingStatus(db: Db, tournamentId: string): Promise<void> {
  const claimed = await db.tournament.updateMany({
    where: { id: tournamentId, status: 'GROUP_STAGE' },
    data: { status: 'KNOCKOUT' },
  });
  if (claimed.count !== 1) {
    throw new TournamentError('INVALID_STATE', '当前状态不能进行淘汰赛排位');
  }
}

export async function confirmKnockoutSeeding(
  db: TransactionalDb,
  input: { tournamentId: string; slots: KnockoutSeedAssignment[]; actorUserId: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const draft = await getKnockoutSeedingDraft(tx, input.tournamentId);
    const assignments = validateSeedAssignments(draft, input.slots);
    await claimKnockoutSeedingStatus(tx, input.tournamentId);
    await assertFirstRoundMatchesPristine(tx, draft);

    for (const assignment of assignments) {
      await tx.match.update({
        where: { id: assignment.matchId },
        data: assignment.slot === 'A' ? { teamAId: assignment.teamId } : { teamBId: assignment.teamId },
      });
    }
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.knockout.seed.confirm',
      entity: 'Tournament',
      entityId: input.tournamentId,
      payload: {
        slots: assignments,
        candidates: draft.candidates.map((candidate) => ({
          seedLabel: candidate.seedLabel,
          teamId: candidate.teamId,
        })),
      },
    });
  });
}
