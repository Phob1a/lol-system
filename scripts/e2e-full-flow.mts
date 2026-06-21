/**
 * Service-layer full-lifecycle driver for a 16-team / 4-group tournament.
 * Runs the entire flow (create → group stage → knockout → champion) against
 * the LOCAL database, asserting invariants at each phase and collecting any
 * problems into a report. NEVER point this at production.
 *
 * Usage: npx tsx scripts/e2e-full-flow.mts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import * as tournamentService from '../src/lib/tournament/tournament-service';
import * as groupsService from '../src/lib/tournament/groups-service';
import * as scoreService from '../src/lib/tournament/score-service';
import * as knockoutService from '../src/lib/tournament/knockout-seeding-service';

// tsx compiles these .ts modules to CJS, so the namespace import exposes the
// real exports under `.default`. Fall back to the namespace for true-ESM envs.
const interop = <T>(m: T): T => ((m as { default?: T }).default ?? m);
const TS = interop(tournamentService);
const GS = interop(groupsService);
const SS = interop(scoreService);
const KS = interop(knockoutService);
const createTournament = TS.createTournament;
const transitionTournament = TS.transitionTournament;
const assignGroups = GS.assignGroups;
const confirmGroups = GS.confirmGroups;
const recordGame = SS.recordGame;
const winsNeeded = SS.winsNeeded;
const getKnockoutSeedingDraft = KS.getKnockoutSeedingDraft;
const confirmKnockoutSeeding = KS.confirmKnockoutSeeding;

const prisma = new PrismaClient();

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const GROUP_COUNT = 4;
const TEAMS_PER_GROUP = 4;
const TEAM_COUNT = GROUP_COUNT * TEAMS_PER_GROUP; // 16
const CFG = {
  template: 'group-knockout' as const,
  groupCount: GROUP_COUNT,
  teamsPerGroup: TEAMS_PER_GROUP,
  advancingPerGroup: 2,
  groupBestOf: 1 as const,
  knockoutBestOf: { QF: 1 as const, SF: 3 as const, FINAL: 5 as const },
};

const problems: string[] = [];
function fail(phase: string, msg: string) {
  problems.push(`[${phase}] ${msg}`);
  console.error(`  ✗ [${phase}] ${msg}`);
}
function check(phase: string, cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ [${phase}] ${msg}`);
  else fail(phase, msg);
}
async function step<T>(phase: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    fail(phase, `threw: ${(e as Error).message}`);
    return undefined;
  }
}

// strength[teamId] — higher wins. Set at creation so results are deterministic.
const strength = new Map<string, number>();
function pickWinner(teamAId: string, teamBId: string): string {
  return (strength.get(teamAId) ?? 0) >= (strength.get(teamBId) ?? 0) ? teamAId : teamBId;
}

async function finishMatch(phase: string, matchId: string) {
  const m0 = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m0) return fail(phase, `match ${matchId} missing`);
  if (!m0.teamAId || !m0.teamBId) return fail(phase, `match ${m0.label} has unset teams`);
  const winner = pickWinner(m0.teamAId, m0.teamBId);
  const need = winsNeeded(m0.bestOf);
  for (let w = 0; w < need; w++) {
    const m = await prisma.match.findUnique({ where: { id: matchId } });
    if (!m) return fail(phase, `match ${matchId} vanished mid-series`);
    if (m.status === 'FINISHED') break;
    await recordGame(prisma, {
      matchId,
      expectedVersion: m.version,
      winnerTeamId: winner,
      actorUserId: ADMIN_ID,
    });
  }
  const done = await prisma.match.findUnique({ where: { id: matchId } });
  if (done?.status !== 'FINISHED' || done.winnerTeamId !== winner)
    fail(phase, `match ${m0.label} did not settle to expected winner (status=${done?.status})`);
}

let ADMIN_ID = '';

async function main() {
  console.log(`\n=== E2E full-flow: ${TEAM_COUNT} teams / ${GROUP_COUNT} groups ===\n`);

  // ── admin actor ──────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: await bcrypt.hash('lol2026', 10),
      role: 'ADMIN',
      mustChangePwd: false,
    },
  });
  ADMIN_ID = admin.id;

  // ── Phase 1: create tournament (SETUP) ───────────────────────────────────
  const t = await step('create', () =>
    createTournament(prisma, { name: 'E2E 16队全流程', teamBudget: 1000, kind: '正赛', config: CFG }, ADMIN_ID),
  );
  if (!t) throw new Error('cannot continue without tournament');
  const TID = t.id;
  check('create', t.status === 'SETUP', `status=SETUP (got ${t.status})`);

  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId: TID },
    include: { groups: true },
    orderBy: { order: 'asc' },
  });
  const groupStage = stages.find((s) => s.type === 'GROUP');
  const koStage = stages.find((s) => s.type === 'KNOCKOUT');
  check('create', groupStage?.groups.length === GROUP_COUNT, `${GROUP_COUNT} groups created (got ${groupStage?.groups.length})`);
  const koSkeleton = await prisma.match.count({ where: { stageId: koStage?.id } });
  check('create', koSkeleton === 7, `knockout skeleton has 7 matches QF4+SF2+FINAL1 (got ${koSkeleton})`);

  // ── Phase 2: create 16 teams (5 players each) ────────────────────────────
  const teamIds: string[] = [];
  await step('teams', async () => {
    for (let i = 0; i < TEAM_COUNT; i++) {
      const ts = Date.now() + i;
      const regs: { id: string; pos: string }[] = [];
      for (let j = 0; j < 5; j++) {
        const player = await prisma.player.create({
          data: { gameId: `e2e16-${i}-${j}-${ts}`, nickname: `T${i}-P${j}` },
        });
        const reg = await prisma.registration.create({
          data: {
            tournamentId: TID,
            playerId: player.id,
            nickname: `T${i}-P${j}`,
            primaryPositions: [POSITIONS[j]],
            secondaryPositions: [],
            currentRank: 'GOLD',
            peakRank: 'PLATINUM',
            cost: j === 0 ? 100 : 80,
            status: 'ACTIVE',
            isCaptain: j === 0,
          },
        });
        regs.push({ id: reg.id, pos: POSITIONS[j] });
      }
      const user = await prisma.user.create({
        data: {
          username: `e2e16-cap-${i}-${ts}`,
          passwordHash: await bcrypt.hash('lol2026', 10),
          role: 'CAPTAIN',
          mustChangePwd: false,
        },
      });
      const team = await prisma.team.create({
        data: { tournamentId: TID, name: `战队${String(i + 1).padStart(2, '0')}`, captainId: regs[0].id, userId: user.id, budgetLeft: 0 },
      });
      for (const r of regs) await prisma.teamSlot.create({ data: { teamId: team.id, position: r.pos, registrationId: r.id } });
      teamIds.push(team.id);
      strength.set(team.id, TEAM_COUNT - i); // team0 strongest
    }
  });
  check('teams', teamIds.length === TEAM_COUNT, `${TEAM_COUNT} teams created (got ${teamIds.length})`);

  // ── Phase 3: walk status machine to GROUPING ─────────────────────────────
  for (const next of ['REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING'] as const) {
    await step('transition', () => transitionTournament(prisma, TID, next));
  }
  const afterGrouping = await prisma.tournament.findUnique({ where: { id: TID } });
  check('transition', afterGrouping?.status === 'GROUPING', `reached GROUPING (got ${afterGrouping?.status})`);

  // ── Phase 4: assign + confirm groups ─────────────────────────────────────
  const groups = await prisma.tournamentGroup.findMany({ where: { stage: { tournamentId: TID } }, orderBy: { name: 'asc' } });
  // distribute team i → group (i % GROUP_COUNT) so each group mixes strengths (distinct ranks, no ties)
  const assignments = groups.map((g, gi) => ({
    groupId: g.id,
    teamIds: teamIds.filter((_, i) => i % GROUP_COUNT === gi),
  }));
  await step('groups.assign', () => assignGroups(prisma, { tournamentId: TID, assignments, actorUserId: ADMIN_ID }));
  await step('groups.confirm', () => confirmGroups(prisma, { tournamentId: TID, actorUserId: ADMIN_ID }));

  const afterConfirm = await prisma.tournament.findUnique({ where: { id: TID } });
  check('groups.confirm', afterConfirm?.status === 'GROUP_STAGE', `status=GROUP_STAGE (got ${afterConfirm?.status})`);
  const groupMatches = await prisma.match.findMany({ where: { stageId: groupStage?.id } });
  const expectedGroupMatches = GROUP_COUNT * ((TEAMS_PER_GROUP * (TEAMS_PER_GROUP - 1)) / 2); // 4*6=24
  check('groups.confirm', groupMatches.length === expectedGroupMatches, `${expectedGroupMatches} round-robin matches (got ${groupMatches.length})`);

  // ── Phase 5: record all group games ──────────────────────────────────────
  for (const gm of groupMatches) await finishMatch('group.record', gm.id);
  const unfinishedGroup = await prisma.match.count({ where: { stageId: groupStage?.id, status: { not: 'FINISHED' } } });
  check('group.record', unfinishedGroup === 0, `all group matches FINISHED (unfinished=${unfinishedGroup})`);
  // each team played TEAMS_PER_GROUP-1 group games
  for (const tid of teamIds) {
    const played = await prisma.match.count({ where: { stageId: groupStage?.id, status: 'FINISHED', OR: [{ teamAId: tid }, { teamBId: tid }] } });
    if (played !== TEAMS_PER_GROUP - 1) { fail('group.record', `team ${tid} played ${played} group games (expected ${TEAMS_PER_GROUP - 1})`); break; }
  }

  // ── Phase 6: knockout seeding (auto defaultSlots) ────────────────────────
  const draft = await step('seeding.draft', () => getKnockoutSeedingDraft(prisma, TID));
  if (draft) {
    check('seeding.draft', draft.candidates.length === GROUP_COUNT * CFG.advancingPerGroup, `${GROUP_COUNT * CFG.advancingPerGroup} candidates advance (got ${draft.candidates.length})`);
    check('seeding.draft', draft.defaultSlots.length === draft.slots.length && draft.slots.length > 0, `defaultSlots fill all ${draft.slots.length} slots (got ${draft.defaultSlots.length})`);
    await step('seeding.confirm', () => confirmKnockoutSeeding(prisma, { tournamentId: TID, slots: draft.defaultSlots, actorUserId: ADMIN_ID }));
  }
  const afterSeed = await prisma.tournament.findUnique({ where: { id: TID } });
  check('seeding.confirm', afterSeed?.status === 'KNOCKOUT', `status=KNOCKOUT (got ${afterSeed?.status})`);

  // ── Phase 7: play knockout rounds in order ───────────────────────────────
  for (const round of ['QF', 'SF', 'FINAL'] as const) {
    const ms = await prisma.match.findMany({ where: { stageId: koStage?.id, roundKey: round } });
    const expected = round === 'QF' ? 4 : round === 'SF' ? 2 : 1;
    check('knockout', ms.length === expected, `${round}: ${expected} matches (got ${ms.length})`);
    for (const m of ms) await finishMatch(`knockout.${round}`, m.id);
  }

  // ── Phase 8: champion + finish ───────────────────────────────────────────
  const finalMatch = await prisma.match.findFirst({ where: { stageId: koStage?.id, roundKey: 'FINAL' } });
  check('champion', !!finalMatch?.winnerTeamId, `final has a winner`);
  if (finalMatch?.winnerTeamId) {
    const champ = await prisma.team.findUnique({ where: { id: finalMatch.winnerTeamId } });
    console.log(`\n  🏆 Champion: ${champ?.name}\n`);
  }
  const nearFinal = await prisma.tournament.findUnique({ where: { id: TID } });
  if (nearFinal?.status === 'KNOCKOUT') await step('finish', () => transitionTournament(prisma, TID, 'FINISHED'));
  const finalState = await prisma.tournament.findUnique({ where: { id: TID } });
  check('finish', finalState?.status === 'FINISHED', `status=FINISHED (got ${finalState?.status})`);

  // ── cleanup: archive the test tournament ─────────────────────────────────
  if (finalState?.status === 'FINISHED') await step('cleanup', () => transitionTournament(prisma, TID, 'ARCHIVED'));

  // ── report ───────────────────────────────────────────────────────────────
  console.log(`\n=== REPORT ===`);
  if (problems.length === 0) console.log('✅ Full flow completed with NO problems.');
  else {
    console.log(`❌ ${problems.length} problem(s) found:`);
    for (const p of problems) console.log('  - ' + p);
  }
  return problems.length;
}

main()
  .then((n) => prisma.$disconnect().then(() => process.exit(n ? 1 : 0)))
  .catch((e) => {
    console.error('FATAL', e);
    prisma.$disconnect().then(() => process.exit(2));
  });
