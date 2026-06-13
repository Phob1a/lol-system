# Match Reservation Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-shot bulk scheduling with single-match reservations that admins and captains can create, change, and clear without changing match competitive state.

**Architecture:** Keep `Match` as the only persisted object and treat `scheduledAt` as the reservation marker. Add one reservation service as the only writable path for `scheduledAt`, retire the batch scheduling route, and move admin/captain UI to explicit reservation flows. Public schedule filtering stays view-level so standings, bracket, and match detail read models still receive all matches.

**Tech Stack:** Next.js 15 App Router, Prisma 5 + PostgreSQL 16, Zod, NextAuth session guards, vitest unit/component projects, Playwright E2E, existing tournament SSE invalidation.

---

## Operating Notes

- Run all commands from `/Users/bytedance/project/lol-system`.
- Use TDD. Every service, schema, and component task starts with failing tests.
- Commit after every task. Use the exact commit commands listed in each task.
- Do not add a Prisma migration. The design uses existing `Match.scheduledAt` and `Match.version`.
- Keep `cancelMatch` for true match cancellation. Reservation cancellation must only set `scheduledAt` to `null`.
- Keep `INVALID_STATE -> 422`. Add `FORBIDDEN -> 403` for captain cross-team access.
- Do not leave a second successful `scheduledAt` writer. `reserveMatch` is the single service that writes reservations after this plan.

## Existing Code Facts

- `src/lib/tournament/score-service.ts` currently exports `claimMatch`, `rescheduleMatch`, `rescheduleMatches`, and true competitive operations (`recordGame`, `deleteGame`, `setWalkover`, `cancelMatch`).
- `src/app/api/tournament/admin/matches/[id]/route.ts` currently handles `op: 'reschedule'` through `rescheduleMatch`.
- `src/app/api/tournament/admin/schedule/batch/route.ts` currently calls `rescheduleMatches`.
- `src/components/admin/tournament/SchedulePlanner.tsx` calls `/api/tournament/admin/schedule/batch`.
- `src/components/admin/tournament/ScheduleTab.tsx` currently has a list/planner toggle and inline `datetime-local` schedule editing.
- `src/components/tournament/ScheduleList.tsx` already hides matches with `scheduledAt === null`; keep that behavior as view-layer filtering.
- `src/lib/tournament/route-errors.ts` maps tournament errors to HTTP responses and currently has no 403 code.
- `src/lib/api-guards.ts` has `requireAdmin()` and `requireCaptain()`.
- `src/app/captain/layout.tsx` computes `showTeamManagement = season?.status === 'COMPLETED'`, matching the spec's captain reservation window.

## File Structure

### Create

- `src/lib/tournament/reservation-service.ts`  
  Single source of truth for reservation listing and writing.
- `src/lib/tournament/reservation-service.test.ts`  
  DB tests for candidate selection, reservation writes, captain authorization, state guards, CAS, and audit.
- `src/lib/tournament/reservation-schema.ts`  
  Zod schemas for `PATCH` reservation payloads and admin candidate query.
- `src/lib/tournament/reservation-schema.test.ts`  
  Unit tests for datetime/null/expectedVersion/tournamentId parsing.
- `src/app/api/tournament/admin/reservations/candidates/route.ts`  
  Admin candidate list route.
- `src/app/api/tournament/admin/reservations/[matchId]/route.ts`  
  Admin create/change/clear reservation route.
- `src/app/api/captain/reservations/route.ts`  
  Captain reservation dashboard data route.
- `src/app/api/captain/reservations/[matchId]/route.ts`  
  Captain create/change/clear reservation route.
- `src/components/admin/tournament/ReservationDialog.tsx`  
  Admin create/change reservation dialog.
- `src/components/admin/tournament/ReservationDialog.test.tsx`
- `src/components/captain/ReservationDashboard.tsx`
- `src/components/captain/ReservationDashboard.test.tsx`
- `src/app/captain/reservations/page.tsx`

### Modify

- `src/lib/tournament/errors.ts`  
  Add `FORBIDDEN`.
- `src/lib/tournament/route-errors.ts`  
  Map `FORBIDDEN` to 403.
- `src/lib/tournament/route-errors.test.ts`  
  Cover `FORBIDDEN -> 403` and keep `INVALID_STATE -> 422`.
- `src/lib/tournament/score-service.ts`  
  Remove `rescheduleMatch` and `rescheduleMatches` exports after routes are moved. Keep `claimMatch` exported for reservation service.
- `src/app/api/tournament/admin/matches/[id]/route.ts`  
  Remove `op: 'reschedule'` or route it to the new admin reservation service during the same task that deletes `rescheduleMatch`.
- `src/app/api/tournament/admin/schedule/batch/route.ts`  
  Retire the endpoint with a clear non-success response until deleted later.
- `src/components/admin/tournament/ScheduleTab.tsx`  
  Remove planner toggle and inline time editing; render reservation workbench actions.
- `src/components/admin/tournament/datetime-local.ts`  
  Update comment to reference reservation dialogs instead of `SchedulePlanner`.
- `src/components/layout/CaptainNav.tsx`  
  Add `/captain/reservations` link under the existing completed-season gate.
- `src/app/captain/layout.tsx`  
  Rename the prop locally to `showCaptainSeasonTools` if that makes the new nav clearer; behavior remains `season?.status === 'COMPLETED'`.
- `scripts/e2e-tournament.spec.ts`  
  Replace batch planner assertions with admin reservation and captain reservation assertions.

### Delete

- `src/components/admin/tournament/SchedulePlanner.tsx`
- `src/lib/tournament/schedule-planner.ts`
- `src/lib/tournament/schedule-planner.test.ts`
- `src/lib/tournament/schedule-batch-schema.ts`
- `src/lib/tournament/schedule-batch-schema.test.ts`
- `src/lib/tournament/reschedule-matches.test.ts`

## Task 1: Error Mapping And Batch Endpoint Retirement

**Purpose:** Close the HTTP contract mismatch first and prevent new UI from accidentally relying on the old batch writer.

**Files:**
- Modify: `src/lib/tournament/errors.ts`
- Modify: `src/lib/tournament/route-errors.ts`
- Modify: `src/lib/tournament/route-errors.test.ts`
- Modify: `src/app/api/tournament/admin/schedule/batch/route.ts`
- Delete later in Task 8: `src/lib/tournament/schedule-batch-schema.ts`
- Delete later in Task 8: `src/lib/tournament/schedule-batch-schema.test.ts`

- [ ] **Step 1: Write failing error mapping tests**

Add this case to `src/lib/tournament/route-errors.test.ts`:

```ts
it('FORBIDDEN -> 403', async () => {
  const res = toResponse(new TournamentError('FORBIDDEN', '无权操作该比赛'));
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.code).toBe('FORBIDDEN');
});
```

Keep the existing `INVALID_STATE -> 422` test unchanged.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npx vitest run src/lib/tournament/route-errors.test.ts --project unit
```

Expected: TypeScript or runtime failure because `FORBIDDEN` is not part of `TournamentErrorCode` or not mapped.

- [ ] **Step 3: Add `FORBIDDEN` to tournament errors**

Modify `src/lib/tournament/errors.ts`:

```ts
export type TournamentErrorCode =
  | 'SEASON_NOT_FOUND'
  | 'TOURNAMENT_EXISTS'
  | 'TOURNAMENT_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'INVALID_STATE'
  | 'FORBIDDEN'
  | 'TEAM_NOT_IN_SEASON'
  | 'MATCH_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DOWNSTREAM_RECORDED'
  | 'STANDINGS_TIED'
  | 'VALIDATION';
```

- [ ] **Step 4: Map `FORBIDDEN` to 403**

Modify `src/lib/tournament/route-errors.ts`:

```ts
const STATUS: Record<string, number> = {
  SEASON_NOT_FOUND: 404,
  TOURNAMENT_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  TOURNAMENT_EXISTS: 409,
  VERSION_CONFLICT: 409,
  DOWNSTREAM_RECORDED: 409,
  STANDINGS_TIED: 409,
  FORBIDDEN: 403,
  INVALID_STATE: 422,
  INVALID_CONFIG: 422,
  TEAM_NOT_IN_SEASON: 422,
  VALIDATION: 422,
};
```

- [ ] **Step 5: Retire `/api/tournament/admin/schedule/batch` as a writer**

Replace `src/app/api/tournament/admin/schedule/batch/route.ts` with a non-success response. Keep `requireAdmin()` so unauthenticated users still get the normal auth behavior.

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';

export async function POST() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  return NextResponse.json(
    { error: '批量排期已退役，请使用单场比赛预约', code: 'BATCH_SCHEDULE_RETIRED' },
    { status: 410 },
  );
}
```

- [ ] **Step 6: Run the focused test and typecheck**

Run:

```bash
npx vitest run src/lib/tournament/route-errors.test.ts --project unit
npm run typecheck
```

Expected: route error tests pass; typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament/errors.ts src/lib/tournament/route-errors.ts src/lib/tournament/route-errors.test.ts src/app/api/tournament/admin/schedule/batch/route.ts
git commit -m "feat(tournament): add forbidden error and retire batch scheduling route"
```

## Task 2: Reservation Schema

**Purpose:** Define the wire contract once so admin and captain routes parse `scheduledAt` consistently.

**Files:**
- Create: `src/lib/tournament/reservation-schema.ts`
- Create: `src/lib/tournament/reservation-schema.test.ts`

- [ ] **Step 1: Write schema tests**

Create `src/lib/tournament/reservation-schema.test.ts`:

```ts
import { expect, it } from 'vitest';
import { reservationPatchSchema, adminReservationCandidatesQuerySchema } from './reservation-schema';

it('accepts a concrete reservation datetime', () => {
  const r = reservationPatchSchema.safeParse({
    expectedVersion: 2,
    scheduledAt: '2026-06-13T12:30:00.000Z',
  });
  expect(r.success).toBe(true);
});

it('accepts null scheduledAt for clearing a reservation', () => {
  const r = reservationPatchSchema.safeParse({ expectedVersion: 2, scheduledAt: null });
  expect(r.success).toBe(true);
});

it('rejects missing scheduledAt because omit would be ambiguous', () => {
  const r = reservationPatchSchema.safeParse({ expectedVersion: 2 });
  expect(r.success).toBe(false);
});

it('rejects fractional expectedVersion', () => {
  const r = reservationPatchSchema.safeParse({
    expectedVersion: 2.5,
    scheduledAt: '2026-06-13T12:30:00.000Z',
  });
  expect(r.success).toBe(false);
});

it('requires tournamentId for admin candidate query', () => {
  expect(adminReservationCandidatesQuerySchema.safeParse({ tournamentId: 't1' }).success).toBe(true);
  expect(adminReservationCandidatesQuerySchema.safeParse({}).success).toBe(false);
});
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run:

```bash
npx vitest run src/lib/tournament/reservation-schema.test.ts --project unit
```

Expected: FAIL because `reservation-schema.ts` does not exist.

- [ ] **Step 3: Implement schemas**

Create `src/lib/tournament/reservation-schema.ts`:

```ts
import { z } from 'zod';

export const reservationPatchSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  scheduledAt: z.string().datetime().nullable(),
});

export const adminReservationCandidatesQuerySchema = z.object({
  tournamentId: z.string().min(1),
});

export type ReservationPatchBody = z.infer<typeof reservationPatchSchema>;
```

- [ ] **Step 4: Run schema tests**

Run:

```bash
npx vitest run src/lib/tournament/reservation-schema.test.ts --project unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/reservation-schema.ts src/lib/tournament/reservation-schema.test.ts
git commit -m "feat(tournament): add reservation request schemas"
```

## Task 3: Reservation Service

**Purpose:** Implement one service for listing and writing reservations, with CAS, archive guard, tournament-state guard, captain authorization, audit, and no competitive side effects.

**Files:**
- Create: `src/lib/tournament/reservation-service.ts`
- Create: `src/lib/tournament/reservation-service.test.ts`
- Modify: `src/lib/tournament/score-service.ts`

- [ ] **Step 1: Write service tests**

Create `src/lib/tournament/reservation-service.test.ts`. Use existing DB helpers from `src/lib/test/db.ts`, `src/lib/tournament/score-service.test-helpers.ts`, and `src/lib/tournament/test-fixtures.ts`. Cover these named cases:

```ts
import { beforeEach, expect, it } from 'vitest';
import { MatchStatus, TournamentStatus } from '@prisma/client';
import { testDb, resetDb } from '@/lib/test/db';
import { setupGroupStage } from './score-service.test-helpers';
import {
  listReservableMatches,
  listCaptainReservationState,
  reserveMatch,
} from './reservation-service';

beforeEach(async () => {
  await resetDb();
});

it('admin candidates include only unscheduled SCHEDULED matches with both teams', async () => {
  const { t } = await setupGroupStage();
  const matches = await testDb.match.findMany({ where: { tournamentId: t.id }, orderBy: { label: 'asc' } });
  const [candidate, scheduled, nullSide, finished] = matches;

  await testDb.match.update({ where: { id: scheduled.id }, data: { scheduledAt: new Date('2026-06-13T10:00:00Z') } });
  await testDb.match.update({ where: { id: nullSide.id }, data: { teamBId: null } });
  await testDb.match.update({ where: { id: finished.id }, data: { status: MatchStatus.FINISHED } });

  const result = await listReservableMatches(testDb, { tournamentId: t.id, actor: { role: 'ADMIN' } });
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

it('reserveMatch writes scheduledAt, increments version, keeps status SCHEDULED, and audits match.reschedule', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id, status: MatchStatus.SCHEDULED } });
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

  const audit = await testDb.auditLog.findFirstOrThrow({ where: { entityId: match.id, action: 'match.reschedule' } });
  expect(audit.payload).toMatchObject({ scheduledAt: scheduledAt.toISOString(), actorRole: 'ADMIN', reservation: true });
});

it('reserveMatch with null clears scheduledAt without canceling the match', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id, status: MatchStatus.SCHEDULED } });
  await testDb.match.update({ where: { id: match.id }, data: { scheduledAt: new Date('2026-06-13T12:30:00Z') } });

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

it('rejects SETUP and FINISHED tournaments', async () => {
  const { t } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.tournament.update({ where: { id: t.id }, data: { status: TournamentStatus.SETUP } });

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

it('rejects archived seasons', async () => {
  const { t, seasonId } = await setupGroupStage();
  const match = await testDb.match.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.season.update({ where: { id: seasonId }, data: { status: 'ARCHIVED' } });

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
```

- [ ] **Step 2: Run service tests and confirm they fail**

Run:

```bash
npx vitest run src/lib/tournament/reservation-service.test.ts --project unit
```

Expected: FAIL because `reservation-service.ts` does not exist.

- [ ] **Step 3: Implement reservation service types and read queries**

Create `src/lib/tournament/reservation-service.ts` with these exported types and functions:

```ts
import type { Match, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit';
import { TournamentError } from './errors';
import { assertSeasonWritable } from './guards';
import { claimMatch } from './score-service';
import { getActiveSeason } from '@/lib/season/season-service';
import type { Db } from './types';

export type ReservationActor =
  | { role: 'ADMIN' }
  | { role: 'CAPTAIN'; teamId: string };

export type ReservableMatch = {
  id: string;
  version: number;
  label: string | null;
  roundKey: string | null;
  groupId: string | null;
  scheduledAt: string | null;
  status: Match['status'];
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  stage: { id: string; type: string; name: string };
};

export type CaptainReservationState = {
  tournamentId: string | null;
  scheduled: ReservableMatch[];
  candidates: ReservableMatch[];
};
```

Implement `shapeReservationMatch` from Prisma rows selected with `teamA`, `teamB`, and `stage`. It must serialize `scheduledAt` using `toISOString()` and preserve null.

- [ ] **Step 4: Implement candidate filtering**

In `reservation-service.ts`, implement:

```ts
function assertCandidate(match: Match, actor: ReservationActor): void {
  if (match.status !== 'SCHEDULED') throw new TournamentError('INVALID_STATE', '只有待赛比赛可以预约');
  if (!match.teamAId || !match.teamBId) throw new TournamentError('INVALID_STATE', '比赛双方未确定');
  if (actor.role === 'CAPTAIN' && ![match.teamAId, match.teamBId].includes(actor.teamId)) {
    throw new TournamentError('FORBIDDEN', '无权操作该比赛');
  }
}
```

For list queries, filter in Prisma first:

```ts
where: {
  tournamentId,
  status: 'SCHEDULED',
  scheduledAt: null,
  teamAId: { not: null },
  teamBId: { not: null },
  ...(actor.role === 'CAPTAIN'
    ? { OR: [{ teamAId: actor.teamId }, { teamBId: actor.teamId }] }
    : {}),
}
```

Then load the tournament with `season` and reject list calls when `season.status === 'ARCHIVED' || season.archivedAt !== null || tournament.status === 'SETUP' || tournament.status === 'FINISHED'`.

- [ ] **Step 5: Implement `reserveMatch` transaction**

`reserveMatch` must:

1. `claimMatch(tx, matchId, expectedVersion)`.
2. `assertSeasonWritable(tx, match.tournamentId)`.
3. Load `tournament.status` and reject `SETUP` / `FINISHED`.
4. Call `assertCandidate(match, actor)`.
5. Update `scheduledAt`.
6. Audit `match.reschedule` with `{ scheduledAt: isoOrNull, actorRole: actor.role, reservation: true }`.

Use this signature:

```ts
export async function reserveMatch(
  db: PrismaClient,
  input: {
    matchId: string;
    expectedVersion: number;
    scheduledAt: Date | null;
    actorUserId: string;
    actor: ReservationActor;
  },
): Promise<void> {
  return db.$transaction(async (tx) => {
    const match = await claimMatch(tx, input.matchId, input.expectedVersion);
    await assertSeasonWritable(tx, match.tournamentId);

    const tournament = await tx.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { status: true },
    });
    if (!tournament) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
    if (tournament.status === 'SETUP' || tournament.status === 'FINISHED') {
      throw new TournamentError('INVALID_STATE', '当前赛事状态不允许预约');
    }

    assertCandidate(match, input.actor);

    await tx.match.update({
      where: { id: match.id },
      data: { scheduledAt: input.scheduledAt },
    });

    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'match.reschedule',
      entity: 'Match',
      entityId: match.id,
      payload: {
        scheduledAt: input.scheduledAt?.toISOString() ?? null,
        actorRole: input.actor.role,
        reservation: true,
      },
    });
  });
}
```

- [ ] **Step 6: Implement captain dashboard state**

Implement:

```ts
export async function listCaptainReservationState(
  db: PrismaClient,
  input: { teamId: string },
): Promise<CaptainReservationState>
```

Behavior:

- Resolve active season with `getActiveSeason(db)`.
- If no active season, return `{ tournamentId: null, scheduled: [], candidates: [] }`.
- Find the season tournament.
- `scheduled` includes current-team matches with `scheduledAt !== null`, including `FINISHED`, `CANCELED`, and `WALKOVER` for read-only history.
- `candidates` delegates to `listReservableMatches(db, { tournamentId, actor: { role: 'CAPTAIN', teamId } })`.

- [ ] **Step 7: Run service tests**

Run:

```bash
npx vitest run src/lib/tournament/reservation-service.test.ts --project unit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tournament/reservation-service.ts src/lib/tournament/reservation-service.test.ts
git commit -m "feat(tournament): add match reservation service"
```

## Task 4: Remove Old `scheduledAt` Service Writers

**Purpose:** Make the service layer enforce the design rule that reservations have one writer.

**Files:**
- Modify: `src/lib/tournament/score-service.ts`
- Modify: `src/app/api/tournament/admin/matches/[id]/route.ts`
- Delete: `src/lib/tournament/reschedule-matches.test.ts`

- [ ] **Step 1: Search current write paths**

Run:

```bash
rg -n "rescheduleMatch|rescheduleMatches|scheduledAt: input.scheduledAt|schedule/batch|match.schedule.batch" src
```

Expected before edits: matches in `score-service.ts`, `[id]/route.ts`, batch route, and old tests.

- [ ] **Step 2: Update admin match route**

Modify `src/app/api/tournament/admin/matches/[id]/route.ts`:

- Remove `rescheduleMatch` from the `score-service` import.
- Import `reserveMatch` from `@/lib/tournament/reservation-service`.
- In the `op === 'reschedule'` branch, call:

```ts
await reserveMatch(prisma, {
  matchId: params.id,
  expectedVersion: body.expectedVersion,
  scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
  actorUserId: guard.session.user.id,
  actor: { role: 'ADMIN' },
});
```

Keep the branch only for backward compatibility with code that has not yet moved to the dedicated reservation route in Task 5. Its semantics must be identical to admin reservation.

- [ ] **Step 3: Delete old batch and single service exports**

In `src/lib/tournament/score-service.ts`, remove:

- `export async function rescheduleMatch(...)`
- `const MAX_BATCH = 200`
- `export async function rescheduleMatches(...)`

Keep `claimMatch` exported. Do not alter `recordGame`, `deleteGame`, `setWalkover`, or `cancelMatch`.

- [ ] **Step 4: Delete obsolete batch service test**

Remove:

```bash
git rm src/lib/tournament/reschedule-matches.test.ts
```

- [ ] **Step 5: Verify no old service writer remains**

Run:

```bash
rg -n "rescheduleMatch|rescheduleMatches|match.schedule.batch|MAX_BATCH" src
```

Expected: no matches. If `[id]/route.ts` still has the literal operation string `'reschedule'`, that is acceptable for compatibility; the function name must be gone.

- [ ] **Step 6: Run focused backend tests**

Run:

```bash
npx vitest run src/lib/tournament/reservation-service.test.ts src/lib/tournament/score-service.test.ts --project unit
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament/score-service.ts src/app/api/tournament/admin/matches/[id]/route.ts
git add -u src/lib/tournament/reschedule-matches.test.ts
git commit -m "refactor(tournament): route schedule changes through reservations"
```

## Task 5: Reservation API Routes

**Purpose:** Add explicit admin and captain reservation endpoints, with shared service semantics and route-level Zod handling.

**Files:**
- Create: `src/app/api/tournament/admin/reservations/candidates/route.ts`
- Create: `src/app/api/tournament/admin/reservations/[matchId]/route.ts`
- Create: `src/app/api/captain/reservations/route.ts`
- Create: `src/app/api/captain/reservations/[matchId]/route.ts`
- Test by extending service/schema/route error tests; this repo has no full route harness.

- [ ] **Step 1: Create admin candidates route**

Implement `src/app/api/tournament/admin/reservations/candidates/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { adminReservationCandidatesQuerySchema } from '@/lib/tournament/reservation-schema';
import { listReservableMatches } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const url = new URL(req.url);
    const query = adminReservationCandidatesQuerySchema.parse({
      tournamentId: url.searchParams.get('tournamentId'),
    });
    const matches = await listReservableMatches(prisma, {
      tournamentId: query.tournamentId,
      actor: { role: 'ADMIN' },
    });
    return NextResponse.json({ matches });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: '参数错误', issues: err.issues }, { status: 422 });
    }
    return toResponse(err);
  }
}
```

- [ ] **Step 2: Create admin reservation PATCH route**

Implement `src/app/api/tournament/admin/reservations/[matchId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guards';
import { reservationPatchSchema } from '@/lib/tournament/reservation-schema';
import { reserveMatch } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

export async function PATCH(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { matchId } = await params;

  try {
    const body = reservationPatchSchema.parse(await req.json());
    await reserveMatch(prisma, {
      matchId,
      expectedVersion: body.expectedVersion,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      actorUserId: guard.session.user.id,
      actor: { role: 'ADMIN' },
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: '参数错误', issues: err.issues }, { status: 422 });
    }
    return toResponse(err);
  }
}
```

- [ ] **Step 3: Create captain routes**

Implement `src/app/api/captain/reservations/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCaptain } from '@/lib/api-guards';
import { listCaptainReservationState } from '@/lib/tournament/reservation-service';
import { toResponse } from '@/lib/tournament/route-errors';

export async function GET() {
  const guard = await requireCaptain();
  if (guard.error) return guard.error;
  const teamId = guard.session.user.teamId;
  if (!teamId) return NextResponse.json({ error: '队长未绑定队伍' }, { status: 403 });

  try {
    const state = await listCaptainReservationState(prisma, { teamId });
    return NextResponse.json(state);
  } catch (err) {
    return toResponse(err);
  }
}
```

Implement `src/app/api/captain/reservations/[matchId]/route.ts` with the same `PATCH` shape as admin (`params: Promise<{ matchId: string }>` and `const { matchId } = await params`), but use `requireCaptain()`, require `session.user.teamId`, and pass:

```ts
actor: { role: 'CAPTAIN', teamId }
```

Publish tournament invalidation after success.

- [ ] **Step 4: Add route contract coverage through schema and service tests**

Extend `src/lib/tournament/reservation-service.test.ts` with:

- captain cross-team write rejects `FORBIDDEN`;
- captain own-team write succeeds;
- route error mapping returns 403 for `FORBIDDEN`.

Extend `src/lib/tournament/reservation-schema.test.ts` with:

```ts
it('rejects omitted expectedVersion', () => {
  expect(reservationPatchSchema.safeParse({ scheduledAt: null }).success).toBe(false);
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/lib/tournament/reservation-schema.test.ts src/lib/tournament/reservation-service.test.ts src/lib/tournament/route-errors.test.ts --project unit
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tournament/admin/reservations src/app/api/captain/reservations src/lib/tournament/reservation-service.test.ts src/lib/tournament/reservation-schema.test.ts
git commit -m "feat(tournament): add admin and captain reservation APIs"
```

## Task 6: Admin Reservation Workbench

**Purpose:** Replace the old list/planner scheduling UI with explicit reservation actions while preserving score, walkover, true cancel, and custom match capabilities.

**Files:**
- Create: `src/components/admin/tournament/ReservationDialog.tsx`
- Create: `src/components/admin/tournament/ReservationDialog.test.tsx`
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`
- Modify: `src/components/admin/tournament/datetime-local.ts`
- Delete in Task 8: `src/components/admin/tournament/SchedulePlanner.tsx`

- [ ] **Step 1: Write dialog component tests**

Create `src/components/admin/tournament/ReservationDialog.test.tsx` with these behaviors:

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReservationDialog } from './ReservationDialog';

const candidates = [
  {
    id: 'm1',
    version: 3,
    label: 'A1',
    roundKey: null,
    groupId: 'g1',
    scheduledAt: null,
    status: 'SCHEDULED',
    teamA: { id: 't1', name: '红队' },
    teamB: { id: 't2', name: '蓝队' },
    stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
  },
];

describe('ReservationDialog', () => {
  it('submits selected match and datetime to admin reservation API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: candidates }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<ReservationDialog open onClose={vi.fn()} tournamentId="tour1" refetch={refetch} />);

    await screen.findByText('红队 vs 蓝队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/tournament/admin/reservations/m1',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows empty state when candidates are empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) }));
    render(<ReservationDialog open onClose={vi.fn()} tournamentId="tour1" refetch={vi.fn()} />);
    expect(await screen.findByText('暂无可预约比赛')).toBeInTheDocument();
  });
});
```

Use the repo's component test conventions if `vi.stubGlobal` cleanup is already centralized; otherwise add `afterEach(() => vi.unstubAllGlobals())`.

- [ ] **Step 2: Run dialog tests and confirm they fail**

Run:

```bash
npx vitest run src/components/admin/tournament/ReservationDialog.test.tsx --project component
```

Expected: FAIL because `ReservationDialog.tsx` does not exist.

- [ ] **Step 3: Implement `ReservationDialog`**

`ReservationDialog` props:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  refetch: () => Promise<void>;
  editingMatch?: {
    id: string;
    version: number;
    scheduledAt: string | null;
    teamA: { name: string } | null;
    teamB: { name: string } | null;
  } | null;
};
```

Behavior:

- On create open, GET `/api/tournament/admin/reservations/candidates?tournamentId=${tournamentId}`.
- On edit open, skip candidate fetch and use `editingMatch`.
- Use `datetime-local` input and `fromLocalDatetimeString`.
- Create mode button text: `创建预约`.
- Edit mode button text: `保存时间`.
- PATCH `/api/tournament/admin/reservations/${matchId}` with `{ expectedVersion, scheduledAt }`.
- On 409, show `toast.error('该比赛已被修改，已刷新')` and `await refetch()`.
- On success, `await refetch()`, then close.

- [ ] **Step 4: Refactor `ScheduleTab` to use reservations**

Modify `src/components/admin/tournament/ScheduleTab.tsx`:

- Remove `SchedulePlanner` import.
- Remove `view` state and list/planner toggle.
- Remove inline time editing state: `reschedulingId`, `localTimes`, `getLocalTime`, and `handleReschedule`.
- Add state:

```ts
const [reservationOpen, setReservationOpen] = useState(false);
const [editingReservation, setEditingReservation] = useState<MatchRow | null>(null);
const [clearingReservationId, setClearingReservationId] = useState<string | null>(null);
```

- Define `scheduledMatches = matches.filter((m) => m.scheduledAt !== null)`.
- Keep `AddMatchDialog`, but keep its button label as `自定义比赛` and do not present it as normal reservation creation.
- Add top button:

```tsx
<Button size="sm" onClick={() => setReservationOpen(true)}>
  <Plus className="mr-1 h-4 w-4" />
  创建预约
</Button>
```

- Add `handleClearReservation(match)` that calls:

```ts
fetch(`/api/tournament/admin/reservations/${match.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expectedVersion: match.version, scheduledAt: null }),
});
```

- Rename the true cancel button text from `取消` to `取消比赛`.
- Only show or enable `修改时间` and `取消预约` when `m.status === 'SCHEDULED'`.
- Keep `录比分`, `轮空`, `取消比赛`, and `收小组进淘汰赛`.
- Empty state for `scheduledMatches.length === 0`: `暂无已预约比赛，可点击创建预约`.

- [ ] **Step 5: Run admin component tests**

Run:

```bash
npx vitest run src/components/admin/tournament/ReservationDialog.test.tsx --project component
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/tournament/ReservationDialog.tsx src/components/admin/tournament/ReservationDialog.test.tsx src/components/admin/tournament/ScheduleTab.tsx src/components/admin/tournament/datetime-local.ts
git commit -m "feat(tournament): replace admin schedule planner with reservations"
```

## Task 7: Captain Reservation Page

**Purpose:** Give captains the same reservation ability for their own matches without exposing other teams or admin-only custom matches.

**Files:**
- Create: `src/components/captain/ReservationDashboard.tsx`
- Create: `src/components/captain/ReservationDashboard.test.tsx`
- Create: `src/app/captain/reservations/page.tsx`
- Modify: `src/components/layout/CaptainNav.tsx`
- Modify: `src/app/captain/layout.tsx`

- [ ] **Step 1: Write captain component tests**

Create `src/components/captain/ReservationDashboard.test.tsx`:

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationDashboard } from './ReservationDashboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReservationDashboard', () => {
  it('shows own scheduled and candidate matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 'tour1',
        scheduled: [{
          id: 'm1',
          version: 1,
          label: 'A1',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: '2026-06-13T12:00:00.000Z',
          status: 'SCHEDULED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't2', name: '蓝队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
        candidates: [{
          id: 'm2',
          version: 2,
          label: 'A2',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: null,
          status: 'SCHEDULED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't3', name: '绿队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
      }),
    }));

    render(<ReservationDashboard />);
    expect(await screen.findByText('红队 vs 蓝队')).toBeInTheDocument();
    expect(await screen.findByText('红队 vs 绿队')).toBeInTheDocument();
  });

  it('can create a reservation from a candidate', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournamentId: 'tour1',
          scheduled: [],
          candidates: [{
            id: 'm2',
            version: 2,
            label: 'A2',
            roundKey: null,
            groupId: 'g1',
            scheduledAt: null,
            status: 'SCHEDULED',
            teamA: { id: 't1', name: '红队' },
            teamB: { id: 't3', name: '绿队' },
            stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
          }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tournamentId: 'tour1', scheduled: [], candidates: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationDashboard />);
    await screen.findByText('红队 vs 绿队');
    fireEvent.change(screen.getByLabelText('时间'), { target: { value: '2026-06-13T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '创建预约' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/captain/reservations/m2',
      expect.objectContaining({ method: 'PATCH' }),
    ));
  });

  it('does not show change or clear actions for non-SCHEDULED history rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 'tour1',
        scheduled: [{
          id: 'm1',
          version: 1,
          label: 'A1',
          roundKey: null,
          groupId: 'g1',
          scheduledAt: '2026-06-13T12:00:00.000Z',
          status: 'FINISHED',
          teamA: { id: 't1', name: '红队' },
          teamB: { id: 't2', name: '蓝队' },
          stage: { id: 's1', type: 'GROUP_STAGE', name: '小组赛' },
        }],
        candidates: [],
      }),
    }));

    render(<ReservationDashboard />);
    expect(await screen.findByText('红队 vs 蓝队')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '修改时间' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消预约' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run captain component tests and confirm they fail**

Run:

```bash
npx vitest run src/components/captain/ReservationDashboard.test.tsx --project component
```

Expected: FAIL because `ReservationDashboard.tsx` does not exist.

- [ ] **Step 3: Implement `ReservationDashboard`**

Implement a client component that:

- GETs `/api/captain/reservations` on mount and after every successful write.
- Renders two sections: `已预约` and `可预约`.
- For candidates, render a `datetime-local` input and `创建预约` button per match.
- For scheduled rows with `status === 'SCHEDULED'`, render `修改时间` and `取消预约`.
- For scheduled rows with other statuses, render the match as read-only and show the status badge.
- PATCH `/api/captain/reservations/${match.id}` with `{ expectedVersion, scheduledAt }`.
- On 409, show `toast.error('该比赛已被修改，已刷新')` and refetch.
- Use the shared `toLocalDatetimeString` / `fromLocalDatetimeString` helpers.

- [ ] **Step 4: Add captain page**

Create `src/app/captain/reservations/page.tsx`:

```tsx
import { ReservationDashboard } from '@/components/captain/ReservationDashboard';

export default function CaptainReservationsPage() {
  return <ReservationDashboard />;
}
```

- [ ] **Step 5: Add captain nav link under the completed-season gate**

Modify `src/components/layout/CaptainNav.tsx`:

```ts
type Props = { showTeamManagement: boolean };

export function CaptainNav({ showTeamManagement }: Props) {
  const pathname = usePathname();
  const links = [
    { href: '/captain', label: '选秀台' },
    ...(showTeamManagement
      ? [
          { href: '/captain/team', label: '队伍管理' },
          { href: '/captain/reservations', label: '比赛预约' },
        ]
      : []),
  ];
  ...
}
```

Keep the existing `showTeamManagement` prop name if changing it would create noise. The business rule remains `season?.status === 'COMPLETED'` in `src/app/captain/layout.tsx`.

- [ ] **Step 6: Run component tests and typecheck**

Run:

```bash
npx vitest run src/components/captain/ReservationDashboard.test.tsx --project component
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/captain/ReservationDashboard.tsx src/components/captain/ReservationDashboard.test.tsx src/app/captain/reservations/page.tsx src/components/layout/CaptainNav.tsx src/app/captain/layout.tsx
git commit -m "feat(captain): add match reservation page"
```

## Task 8: Cleanup, Public Compatibility, And E2E

**Purpose:** Remove dead planner artifacts, verify public schedule semantics, and run the full acceptance path.

**Files:**
- Delete: `src/components/admin/tournament/SchedulePlanner.tsx`
- Delete: `src/lib/tournament/schedule-planner.ts`
- Delete: `src/lib/tournament/schedule-planner.test.ts`
- Delete: `src/lib/tournament/schedule-batch-schema.ts`
- Delete: `src/lib/tournament/schedule-batch-schema.test.ts`
- Modify: `src/components/tournament/ScheduleList.test.tsx`
- Modify: `scripts/e2e-tournament.spec.ts`

- [ ] **Step 1: Remove planner and batch artifacts**

Run:

```bash
git rm src/components/admin/tournament/SchedulePlanner.tsx
git rm src/lib/tournament/schedule-planner.ts src/lib/tournament/schedule-planner.test.ts
git rm src/lib/tournament/schedule-batch-schema.ts src/lib/tournament/schedule-batch-schema.test.ts
```

- [ ] **Step 2: Verify no dead references**

Run:

```bash
rg -n "SchedulePlanner|schedule-planner|scheduleBatchSchema|schedule/batch|rescheduleMatches|match.schedule.batch" src scripts
```

Expected: no matches except possible historical comments in docs outside `src` and `scripts`.

- [ ] **Step 3: Strengthen public schedule component coverage**

Extend `src/components/tournament/ScheduleList.test.tsx` with a case that renders one scheduled match and one unscheduled match, then asserts only the scheduled match is visible. Use existing test fixture style in that file and assert the hidden match's team names are absent when they appear only in the unscheduled row.

- [ ] **Step 4: Update E2E**

Modify `scripts/e2e-tournament.spec.ts`:

- Remove use of the old schedule planner or batch endpoint.
- Admin flow: open `/admin/tournament`, go to the schedule tab, click `创建预约`, choose the first candidate, set a concrete time, save, then assert the row appears in the admin schedule list.
- Public flow: open `/tournament`, assert the scheduled match appears in the schedule section and an unscheduled candidate match does not appear in the schedule timeline.
- Captain flow: sign in as one captain account produced by `scripts/seed-e2e.mjs`, open `/captain/reservations`, create or change one own-team reservation, then confirm `/tournament` shows it.
- Cancellation flow: captain or admin clicks `取消预约`, then confirm `/tournament` hides that match while admin candidates include it again.

Use explicit waits; do not use `networkidle` because SSE keeps a stream open.

- [ ] **Step 5: Run focused regression**

Run:

```bash
npx vitest run src/lib/tournament/reservation-schema.test.ts src/lib/tournament/reservation-service.test.ts src/lib/tournament/route-errors.test.ts --project unit
npx vitest run src/components/admin/tournament/ReservationDialog.test.tsx src/components/captain/ReservationDashboard.test.tsx src/components/tournament/ScheduleList.test.tsx --project component
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run full regression**

Run:

```bash
npx vitest run
npm run build
```

Expected: all tests pass and Next.js build succeeds.

- [ ] **Step 7: Run E2E**

Run:

```bash
node scripts/seed-e2e.mjs
PORT=3103 npm run dev > /tmp/lol-system-e2e.log 2>&1 &
DEV_PID=$!
sleep 8
npx playwright test --config scripts/playwright.config.ts scripts/e2e-tournament.spec.ts
kill $DEV_PID
```

Expected: Playwright passes. If the dev server fails to start, inspect `/tmp/lol-system-e2e.log`, fix the start failure, and rerun this step.

- [ ] **Step 8: Commit**

```bash
git add scripts/e2e-tournament.spec.ts src/components/tournament/ScheduleList.test.tsx
git add -u src/components/admin/tournament/SchedulePlanner.tsx src/lib/tournament/schedule-planner.ts src/lib/tournament/schedule-planner.test.ts src/lib/tournament/schedule-batch-schema.ts src/lib/tournament/schedule-batch-schema.test.ts
git commit -m "test(tournament): cover reservation scheduling flow"
```

## Acceptance Checklist

- `reserveMatch` is the only service that writes `Match.scheduledAt`.
- `POST /api/tournament/admin/schedule/batch` cannot successfully write `scheduledAt`.
- Old `rescheduleMatches` and `SchedulePlanner` are removed.
- Admin and captain reservation routes share the same service semantics.
- Captain cross-team writes return `FORBIDDEN` and HTTP 403.
- `INVALID_STATE` still returns HTTP 422.
- Reservation clear sets `scheduledAt = null` and leaves `Match.status` unchanged.
- `FINISHED`, `WALKOVER`, and `CANCELED` scheduled rows are read-only for appointment actions.
- Public schedule hides unscheduled matches through `ScheduleList`, while the read model still returns all matches.
- Full validation passes:

```bash
npx vitest run
npm run typecheck
npm run build
npx playwright test --config scripts/playwright.config.ts scripts/e2e-tournament.spec.ts
```

## Spec Coverage Map

| Spec Section | Covered By |
|---|---|
| §1 goal and single reservation model | Tasks 3, 4 |
| §2 decisions and batch retirement | Tasks 1, 4, 8 |
| §3.1 reservation object | Tasks 3, 5 |
| §3.2 candidate definition | Task 3 |
| §3.3 modify and clear reservation | Tasks 3, 5, 6, 7 |
| §3.4 service interface and audit | Task 3 |
| §3.5 routes and error mapping | Tasks 1, 2, 5 |
| §4 admin page | Task 6 |
| §5 captain page | Task 7 |
| §6 public page | Task 8 |
| §7 existing feature relationships | Tasks 4, 6, 8 |
| §8 tests | Tasks 1 through 8 |
| §9 out of scope | Preserved by not adding confirmation, resource conflicts, batch import, captain custom matches, or deletion |

## Review Notes For Claude

- The deliberate compatibility choice is keeping `op: 'reschedule'` in `src/app/api/tournament/admin/matches/[id]/route.ts` temporarily, but routing it through `reserveMatch`. This prevents old clients from bypassing the new checks while the dedicated reservation endpoints land.
- The old batch endpoint is retired in Task 1 before UI work begins, then planner files are removed in Task 8. This ordering prevents a half-migrated UI from silently using the unsafe batch writer.
- Captain reservation visibility uses the existing `COMPLETED` season gate because the draft engine keeps the season in `COMPLETED` while tournament play happens.
