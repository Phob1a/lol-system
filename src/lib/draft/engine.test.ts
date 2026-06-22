import { describe, expect, it, vi } from 'vitest';
import { testDb } from '@/lib/test/db';
import { appointCaptain } from '@/lib/captains/captain-service';
import { adminCreateRegistration } from '@/lib/registration/registration-service';
import { createTournament, transitionTournament } from '@/lib/tournament/tournament-service';
import { CFG_2x4x2 } from '@/lib/tournament/test-fixtures';

const T = { kind: '正赛', config: CFG_2x4x2 };
import {
  DraftStateError,
  startDraft,
  startRound,
  submitPick,
} from './engine';

vi.mock('@/lib/db', async () => {
  const { testDb: prisma } = await import('@/lib/test/db');
  return { prisma };
});

const actorUserId = 'admin-user';

function registrationInput(gameId: string, nickname: string, cost = 10) {
  return {
    gameId,
    nickname,
    primaryPositions: ['TOP' as const],
    secondaryPositions: [],
    currentRank: '钻石',
    peakRank: '大师',
    willingToCaptain: false,
    availability: '周末全天',
    cost,
  };
}

async function openSeason(name: string) {
  const tournament = await createTournament(testDb, { name, teamBudget: 1000, kind: T.kind, config: T.config }, 'u');
  await transitionTournament(testDb, tournament.id, 'REGISTRATION');
  return tournament;
}

async function prepareDraftWithArchivedSeasonRegistration() {
  const oldTournament = await openSeason('S1');
  const oldRegistration = await adminCreateRegistration(
    testDb,
    oldTournament.id,
    registrationInput('old-player', '旧赛季选手'),
  );

  const currentTournament = await openSeason('S2');
  const captain = await adminCreateRegistration(testDb, currentTournament.id, {
    ...registrationInput('captain', '当前队长', 0),
    primaryPositions: ['MID'],
    willingToCaptain: true,
  });
  await transitionTournament(testDb, currentTournament.id, 'ROSTER_LOCKED');
  await appointCaptain(testDb, captain.id);
  await startDraft(currentTournament.id, actorUserId);

  return { currentTournament, captain, oldRegistration };
}

describe('draft engine season boundaries', () => {
  it('normalizes budget after debiting a decimal captain cost', async () => {
    const tournament = await createTournament(testDb, { name: 'decimal-budget', teamBudget: 33.5, kind: T.kind, config: T.config }, 'u');
    await transitionTournament(testDb, tournament.id, 'REGISTRATION');
    const captain = await adminCreateRegistration(testDb, tournament.id, {
      ...registrationInput('decimal-captain', '小数队长', 33.4),
      primaryPositions: ['MID'],
      willingToCaptain: true,
    });
    await transitionTournament(testDb, tournament.id, 'ROSTER_LOCKED');
    const { teamId } = await appointCaptain(testDb, captain.id);

    await startDraft(tournament.id, actorUserId);

    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.budgetLeft).toBe(0.1);
  });

  it('rejects submitPick when registration belongs to another season', async () => {
    const { currentTournament, captain, oldRegistration } =
      await prepareDraftWithArchivedSeasonRegistration();
    await startRound({
      tournamentId: currentTournament.id,
      mode: 'ADMIN_ORDER',
      adminProvidedOrder: [captain.id],
      actorUserId,
    });
    const session = await testDb.draftSession.findUniqueOrThrow({
      where: { tournamentId: currentTournament.id },
    });

    await expect(
      submitPick({
        tournamentId: currentTournament.id,
        byCaptainId: captain.id,
        registrationId: oldRegistration.id,
        position: 'TOP',
        expectedSeq: session.seq,
        actorUserId,
      }),
    ).rejects.toMatchObject({
      name: 'DraftStateError',
      code: 'NO_REGISTRATION',
    } satisfies Partial<DraftStateError>);
    expect(await testDb.draftPick.count()).toBe(0);
  });

  it('rejects MANUAL assignments when registration belongs to another season', async () => {
    const { currentTournament, captain, oldRegistration } =
      await prepareDraftWithArchivedSeasonRegistration();

    await expect(
      startRound({
        tournamentId: currentTournament.id,
        mode: 'MANUAL',
        manualAssignments: [
          {
            captainId: captain.id,
            registrationId: oldRegistration.id,
            position: 'TOP',
          },
        ],
        actorUserId,
      }),
    ).rejects.toMatchObject({
      name: 'DraftStateError',
      code: 'NO_REGISTRATION',
    } satisfies Partial<DraftStateError>);
    expect(await testDb.draftPick.count()).toBe(0);
  });
});
