import { beforeEach, expect, it } from 'vitest';
import { MatchStatus, TournamentStatus } from '@prisma/client';
import { resetDb, testDb } from '@/lib/test/db';
import { setupGroupStage } from './score-service.test-helpers';
import { seedTournamentWithTeams } from './test-fixtures';
import {
  listCaptainReservationState,
  listReservableMatches,
  reserveMatch,
} from './reservation-service';

beforeEach(async () => {
  await resetDb();
});

it('admin candidates include only unscheduled SCHEDULED matches with both teams', async () => {
  const { t } = await setupGroupStage();
  const matches = await testDb.match.findMany({
    where: { tournamentId: t.id },
    orderBy: { label: 'asc' },
  });
  const [candidate, scheduled, nullSide, finished] = matches;

  await testDb.match.update({
    where: { id: scheduled.id },
    data: { scheduledAt: new Date('2026-06-13T10:00:00Z') },
  });
  await testDb.match.update({ where: { id: nullSide.id }, data: { teamBId: null } });
  await testDb.match.update({ where: { id: finished.id }, data: { status: MatchStatus.FINISHED } });

  const result = await listReservableMatches(testDb, {
    tournamentId: t.id,
    actor: { role: 'ADMIN' },
  });

  expect(result.map((m) => m.id)).toContain(candidate.id);
  expect(result.map((m) => m.id)).not.toContain(scheduled.id);
  expect(result.map((m) => m.id)).not.toContain(nullSide.id);
  expect(result.map((m) => m.id)).not.toContain(finished.id);
});

it('captain candidates are limited to own team matches', async () => {
  const { t, teamIds } = await setupGroupStage();

  const result = await listReservableMatches(testDb, {
    tournamentId: t.id,
    actor: { role: 'CAPTAIN', teamId: teamIds[0] },
  });

  expect(result.length).toBeGreaterThan(0);
  expect(result.every((m) => m.teamA?.id === teamIds[0] || m.teamB?.id === teamIds[0])).toBe(true);
});

it('rejects reservation listing during pre-bracket states', async () => {
  const { tournamentId } = await seedTournamentWithTeams(2);
  for (const st of ['REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING'] as const) {
    await testDb.tournament.update({ where: { id: tournamentId }, data: { status: st } });
    expect(await listReservableMatches(testDb, { tournamentId, actor: { role: 'ADMIN' } })).toEqual([]);
  }
});

it('allows listing during GROUP_STAGE', async () => {
  const { tournamentId } = await seedTournamentWithTeams(2);
  await testDb.tournament.update({ where: { id: tournamentId }, data: { status: 'GROUP_STAGE' } });
  await expect(listReservableMatches(testDb, { tournamentId, actor: { role: 'ADMIN' } })).resolves.toBeDefined();
});

it.each([TournamentStatus.SETUP, TournamentStatus.FINISHED])(
  'listReservableMatches returns empty candidates when tournament is %s',
  async (status) => {
    const { t } = await setupGroupStage();
    await testDb.tournament.update({ where: { id: t.id }, data: { status } });

    const result = await listReservableMatches(testDb, {
      tournamentId: t.id,
      actor: { role: 'ADMIN' },
    });

    expect(result).toEqual([]);
  },
);

it('listReservableMatches returns empty when tournament is archived', async () => {
  const { t } = await setupGroupStage();
  await testDb.tournament.update({ where: { id: t.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });

  const result = await listReservableMatches(testDb, {
    tournamentId: t.id,
    actor: { role: 'ADMIN' },
  });

  expect(result).toEqual([]);
});

it('listCaptainReservationState still renders scheduled history when tournament is FINISHED', async () => {
  const { t, teamIds } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({
    where: { tournamentId: t.id, teamAId: teamIds[0] },
  });
  await testDb.match.update({
    where: { id: match.id },
    data: {
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      status: MatchStatus.FINISHED,
    },
  });
  await testDb.tournament.update({
    where: { id: t.id },
    data: { status: TournamentStatus.FINISHED },
  });

  const state = await listCaptainReservationState(testDb, { teamId: teamIds[0] });

  expect(state.scheduled.map((m) => m.id)).toContain(match.id);
  expect(state.candidates).toEqual([]);
});

it('reserveMatch writes scheduledAt, increments version, keeps status SCHEDULED, and audits match.reschedule', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({
    where: {
      tournamentId: t.id,
      status: MatchStatus.SCHEDULED,
      teamAId: { not: null },
      teamBId: { not: null },
    },
  });
  const scheduledAt = new Date('2026-06-13T12:30:00Z');

  await reserveMatch(testDb, {
    matchId: match.id,
    expectedVersion: match.version,
    scheduledAt,
    actorUserId: 'admin-user',
    actor: { role: 'ADMIN' },
  });

  const stored = await testDb.match.findUniqueOrThrow({ where: { id: match.id } });
  expect(stored.scheduledAt?.toISOString()).toBe(scheduledAt.toISOString());
  expect(stored.version).toBe(match.version + 1);
  expect(stored.status).toBe(MatchStatus.SCHEDULED);

  const audit = await testDb.auditLog.findFirstOrThrow({
    where: { entityId: match.id, action: 'match.reschedule' },
  });
  expect(audit.payload).toMatchObject({
    scheduledAt: scheduledAt.toISOString(),
    actorRole: 'ADMIN',
    reservation: true,
  });
});

it('reserveMatch with null clears scheduledAt without canceling the match', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({
    where: {
      tournamentId: t.id,
      status: MatchStatus.SCHEDULED,
      teamAId: { not: null },
      teamBId: { not: null },
    },
  });
  await testDb.match.update({
    where: { id: match.id },
    data: { scheduledAt: new Date('2026-06-13T12:30:00Z') },
  });

  await reserveMatch(testDb, {
    matchId: match.id,
    expectedVersion: match.version,
    scheduledAt: null,
    actorUserId: 'admin-user',
    actor: { role: 'ADMIN' },
  });

  const stored = await testDb.match.findUniqueOrThrow({ where: { id: match.id } });
  expect(stored.scheduledAt).toBeNull();
  expect(stored.status).toBe(MatchStatus.SCHEDULED);
});

it('captain can reserve own team match', async () => {
  const { t, teamIds } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({
    where: { tournamentId: t.id, OR: [{ teamAId: teamIds[0] }, { teamBId: teamIds[0] }] },
  });

  await reserveMatch(testDb, {
    matchId: match.id,
    expectedVersion: match.version,
    scheduledAt: new Date('2026-06-13T12:30:00Z'),
    actorUserId: 'captain-user',
    actor: { role: 'CAPTAIN', teamId: teamIds[0] },
  });

  const stored = await testDb.match.findUniqueOrThrow({ where: { id: match.id } });
  expect(stored.scheduledAt).not.toBeNull();
});

it('captain cannot reserve another team match', async () => {
  const { t, teamIds } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({
    where: {
      tournamentId: t.id,
      teamAId: { not: teamIds[0] },
      teamBId: { not: teamIds[0] },
    },
  });

  await expect(
    reserveMatch(testDb, {
      matchId: match.id,
      expectedVersion: match.version,
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      actorUserId: 'captain-user',
      actor: { role: 'CAPTAIN', teamId: teamIds[0] },
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it.each([MatchStatus.FINISHED, MatchStatus.CANCELED, MatchStatus.WALKOVER])(
  'rejects %s matches',
  async (status) => {
    const { t } = await setupGroupStage();
    const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
    await testDb.match.update({ where: { id: match.id }, data: { status } });

    await expect(
      reserveMatch(testDb, {
        matchId: match.id,
        expectedVersion: match.version,
        scheduledAt: new Date('2026-06-13T12:30:00Z'),
        actorUserId: 'admin-user',
        actor: { role: 'ADMIN' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  },
);

it('admin reservation compatibility rejects FINISHED matches', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.match.update({ where: { id: match.id }, data: { status: MatchStatus.FINISHED } });

  await expect(
    reserveMatch(testDb, {
      matchId: match.id,
      expectedVersion: match.version,
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      actorUserId: 'admin-user',
      actor: { role: 'ADMIN' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

it('rejects matches with an unresolved side', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.match.update({ where: { id: match.id }, data: { teamBId: null } });

  await expect(
    reserveMatch(testDb, {
      matchId: match.id,
      expectedVersion: match.version,
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      actorUserId: 'admin-user',
      actor: { role: 'ADMIN' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

it.each([TournamentStatus.SETUP, TournamentStatus.FINISHED])(
  'reserveMatch rejects tournament status %s',
  async (status) => {
    const { t } = await setupGroupStage();
    const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
    await testDb.tournament.update({ where: { id: t.id }, data: { status } });

    await expect(
      reserveMatch(testDb, {
        matchId: match.id,
        expectedVersion: match.version,
        scheduledAt: new Date('2026-06-13T12:30:00Z'),
        actorUserId: 'admin-user',
        actor: { role: 'ADMIN' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  },
);

it('rejects version conflicts without writing scheduledAt', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });

  await expect(
    reserveMatch(testDb, {
      matchId: match.id,
      expectedVersion: match.version + 1,
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      actorUserId: 'admin-user',
      actor: { role: 'ADMIN' },
    }),
  ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

  const stored = await testDb.match.findUniqueOrThrow({ where: { id: match.id } });
  expect(stored.scheduledAt).toBeNull();
});

it('reserveMatch rejects archived tournament', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.tournament.update({ where: { id: t.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });

  await expect(
    reserveMatch(testDb, {
      matchId: match.id,
      expectedVersion: match.version,
      scheduledAt: new Date('2026-06-13T12:30:00Z'),
      actorUserId: 'admin-user',
      actor: { role: 'ADMIN' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE' });
});
