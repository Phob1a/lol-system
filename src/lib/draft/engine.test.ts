import { describe, expect, it, vi } from 'vitest';
import { testDb } from '@/lib/test/db';
import { appointCaptain } from '@/lib/captains/captain-service';
import { adminCreateRegistration } from '@/lib/registration/registration-service';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
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
    cost,
  };
}

async function openSeason(name: string) {
  const season = await createSeason(testDb, { name, teamBudget: 1000, tournament: T }, 'u');
  await transitionSeason(testDb, season.id, 'REGISTRATION');
  return season;
}

async function prepareDraftWithArchivedSeasonRegistration() {
  const oldSeason = await openSeason('S1');
  const oldRegistration = await adminCreateRegistration(
    testDb,
    oldSeason.id,
    registrationInput('old-player', '旧赛季选手'),
  );

  const currentSeason = await openSeason('S2');
  const captain = await adminCreateRegistration(testDb, currentSeason.id, {
    ...registrationInput('captain', '当前队长', 0),
    primaryPositions: ['MID'],
    willingToCaptain: true,
  });
  await transitionSeason(testDb, currentSeason.id, 'ROSTER_LOCKED');
  await appointCaptain(testDb, captain.id);
  await startDraft(currentSeason.id, actorUserId);

  return { currentSeason, captain, oldRegistration };
}

describe('draft engine season boundaries', () => {
  it('normalizes budget after debiting a decimal captain cost', async () => {
    const season = await createSeason(testDb, { name: 'decimal-budget', teamBudget: 33.5, tournament: T }, 'u');
    await transitionSeason(testDb, season.id, 'REGISTRATION');
    const captain = await adminCreateRegistration(testDb, season.id, {
      ...registrationInput('decimal-captain', '小数队长', 33.4),
      primaryPositions: ['MID'],
      willingToCaptain: true,
    });
    await transitionSeason(testDb, season.id, 'ROSTER_LOCKED');
    const { teamId } = await appointCaptain(testDb, captain.id);

    await startDraft(season.id, actorUserId);

    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.budgetLeft).toBe(0.1);
  });

  it('rejects submitPick when registration belongs to another season', async () => {
    const { currentSeason, captain, oldRegistration } =
      await prepareDraftWithArchivedSeasonRegistration();
    await startRound({
      seasonId: currentSeason.id,
      mode: 'ADMIN_ORDER',
      adminProvidedOrder: [captain.id],
      actorUserId,
    });
    const session = await testDb.draftSession.findUniqueOrThrow({
      where: { seasonId: currentSeason.id },
    });

    await expect(
      submitPick({
        seasonId: currentSeason.id,
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
    const { currentSeason, captain, oldRegistration } =
      await prepareDraftWithArchivedSeasonRegistration();

    await expect(
      startRound({
        seasonId: currentSeason.id,
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
