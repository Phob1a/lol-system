# Season / Registration Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single-draft system into a multi-season platform with public anonymous registration, admin-appointed captains backed by per-team accounts, the draft engine retargeted to season-scoped participants, a re-laid-out admin draft page, and a new public spectator page.

**Architecture:** `Season` owns everything. `Player` becomes a cross-season identity master; `Registration` carries per-season participation data and is what the draft operates on. `User` is login-only (admin + per-team accounts). The event-sourced draft engine is retargeted from `Player` to `Registration` and made season-scoped. New code follows the existing service-layer + thin-route-handler pattern.

**Tech Stack:** Next.js 15 (App Router), Prisma 5 + PostgreSQL 16, NextAuth v4 (JWT), Zod, vitest, Tailwind + shadcn/ui, in-process SSE (`EventEmitter`).

**Spec:** `docs/superpowers/specs/2026-05-20-season-registration-refactor-design.md`

**Phases:**
- Phase 0 — Schema, migration, seed, test harness (Tasks 1–4)
- Phase 1 — Season service & admin UI (Tasks 5–9)
- Phase 2 — Registration: public + admin (Tasks 10–16)
- Phase 3 — Captains, team accounts, auth (Tasks 17–24)
- Phase 4 — Draft engine retarget & routes (Tasks 25–28)
- Phase 5 — Draft UI & public spectator page (Tasks 29–33)

**Conventions for every task:** all imports use the `@/` alias. After each task, run `npm run typecheck` and `npm run test` before the commit step; both must pass unless the task explicitly notes a deliberate cross-task error. Commit messages use the `type(scope): subject` style seen in `git log`.

---

## Phase 0 — Schema, Migration, Seed, Test Harness

### Task 1: Rewrite the Prisma schema

**Files:**
- Modify (full rewrite): `prisma/schema.prisma`

- [ ] **Step 1: Replace the entire schema file**

Replace the full contents of `prisma/schema.prisma` with:

```prisma
// LoL Season & Draft System — Prisma schema
// Provider: PostgreSQL 16
// Multi-season: each Season owns registrations, teams, and exactly one draft.
// Event-sourced draft (DraftEvent) with materialized state for fast reads.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Position {
  TOP
  JUNGLE
  MID
  ADC
  SUPPORT
}

enum Role {
  ADMIN
  CAPTAIN
}

enum SeasonStatus {
  SETUP
  REGISTRATION
  ROSTER_LOCKED
  DRAFTING
  COMPLETED
  ARCHIVED
}

enum RegistrationStatus {
  ACTIVE
  EXCLUDED
}

enum DraftStatus {
  NOT_STARTED
  IN_PROGRESS
  FINISHED
}

enum RoundMode {
  MANUAL
  ADMIN_ORDER
  REVERSE_LAST
  BUDGET_DESC
}

enum RoundStatus {
  PENDING
  ACTIVE
  DONE
}

enum EventType {
  DRAFT_STARTED
  ROUND_STARTED
  PICK_MADE
  PICK_REVOKED
  ROUND_REWOUND
  DRAFT_RESET
  SLOT_REARRANGED
  ORDER_SET
}

model Season {
  id         String       @id @default(cuid())
  name       String
  status     SeasonStatus @default(SETUP)
  teamBudget Float        @default(1000)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  archivedAt DateTime?

  registrations Registration[]
  teams         Team[]
  draftSession  DraftSession?

  @@map("seasons")
}

model Player {
  id        String   @id @default(cuid())
  gameId    String   @unique
  nickname  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  registrations Registration[]

  @@map("players")
}

model Registration {
  id                 String             @id @default(cuid())
  seasonId           String
  playerId           String
  nickname           String
  primaryPositions   Position[]
  secondaryPositions Position[]
  currentRank        String
  peakRank           String
  willingToCaptain   Boolean            @default(false)
  statement          String?
  cost               Float              @default(0)
  isCaptain          Boolean            @default(false)
  status             RegistrationStatus @default(ACTIVE)
  registeredAt       DateTime           @default(now())

  season        Season      @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  player        Player      @relation(fields: [playerId], references: [id])
  teamAsCaptain Team?       @relation("TeamCaptain")
  slots         TeamSlot[]
  picksAsTarget DraftPick[] @relation("PickedRegistration")

  @@unique([seasonId, playerId])
  @@index([seasonId])
  @@map("registrations")
}

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  passwordHash  String
  mustChangePwd Boolean  @default(true)
  role          Role     @default(CAPTAIN)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  team Team?

  @@map("users")
}

model Team {
  id         String @id @default(cuid())
  seasonId   String
  name       String
  captainId  String @unique
  userId     String @unique
  budgetLeft Float  @default(0)

  season  Season       @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  captain Registration @relation("TeamCaptain", fields: [captainId], references: [id])
  account User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  slots   TeamSlot[]
  picks   DraftPick[]  @relation("PickingTeam")

  createdAt DateTime @default(now())

  @@index([seasonId])
  @@map("teams")
}

model TeamSlot {
  id             String   @id @default(cuid())
  teamId         String
  position       Position
  registrationId String?

  team         Team          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  registration Registration? @relation(fields: [registrationId], references: [id])

  @@unique([teamId, position])
  @@map("team_slots")
}

model DraftSession {
  id           String      @id @default(cuid())
  seasonId     String      @unique
  status       DraftStatus @default(NOT_STARTED)
  currentRound Int         @default(0)
  onTheClock   String?
  seq          Int         @default(0)
  startedAt    DateTime?
  finishedAt   DateTime?

  season Season       @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  rounds DraftRound[]
  events DraftEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("draft_sessions")
}

model DraftRound {
  id        String      @id @default(cuid())
  sessionId String
  roundNo   Int
  mode      RoundMode
  pickOrder Json        @default("[]")
  status    RoundStatus @default(PENDING)

  session DraftSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  picks   DraftPick[]

  createdAt DateTime @default(now())

  @@unique([sessionId, roundNo])
  @@map("draft_rounds")
}

model DraftPick {
  id             String    @id @default(cuid())
  roundId        String
  pickIndex      Int
  byCaptainId    String
  teamId         String
  registrationId String
  position       Position
  costPaid       Float
  revoked        Boolean   @default(false)
  revokedAt      DateTime?
  pickedAt       DateTime  @default(now())

  round        DraftRound   @relation(fields: [roundId], references: [id], onDelete: Cascade)
  team         Team         @relation("PickingTeam", fields: [teamId], references: [id])
  registration Registration @relation("PickedRegistration", fields: [registrationId], references: [id])

  @@map("draft_picks")
}

model DraftEvent {
  id        String    @id @default(cuid())
  sessionId String
  type      EventType
  payload   Json
  actorId   String
  seq       Int

  session DraftSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([sessionId, seq])
  @@index([sessionId, createdAt])
  @@map("draft_events")
}
```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "refactor(schema): multi-season models — Season, Registration, retargeted draft"
```

---

### Task 2: Reset the database and generate the client

**Files:**
- Create: `prisma/migrations/<timestamp>_season_registration_refactor/` (generated)

- [ ] **Step 1: Drop old migrations and reset**

The old migrations describe the pre-refactor schema and there is no production data. Remove them and create one fresh migration.

```bash
rm -rf prisma/migrations
npx prisma migrate dev --name season_registration_refactor
```

Expected: a new migration directory is created and applied; output ends with `Your database is now in sync with your schema.`

- [ ] **Step 2: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 3: Verify TypeScript sees the new models**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: errors are present (existing code still references `Player.isCaptain`, `Config`, etc.) — that is fine, later tasks fix them. Confirm the errors are about old field usage, not about the schema itself.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations
git commit -m "refactor(db): reset migrations for season_registration_refactor"
```

---

### Task 3: Rewrite the seed script

**Files:**
- Modify (full rewrite): `prisma/seed.ts`

- [ ] **Step 1: Replace the seed file**

Replace the full contents of `prisma/seed.ts` with:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const initialPwd = process.env.DEFAULT_ADMIN_PASSWORD ?? 'lol2026';
  const passwordHash = await bcrypt.hash(initialPwd, 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      mustChangePwd: true,
    },
    update: {},
  });

  // Dev convenience: a sample season open for registration.
  if (process.env.SEED_SAMPLE_SEASON === '1') {
    const existing = await prisma.season.findFirst({ where: { status: { not: 'ARCHIVED' } } });
    if (!existing) {
      await prisma.season.create({
        data: { name: 'S1 测试赛季', status: 'REGISTRATION', teamBudget: 1000 },
      });
      console.log('  Sample season "S1 测试赛季" created (REGISTRATION).');
    }
  }

  console.log('Seed complete.');
  console.log(`  Admin account: username="admin" password="${initialPwd}" (must change on first login)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: `Seed complete.` and the admin-account line.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "refactor(seed): seed admin account + optional sample season"
```

---

### Task 4: Add a test-database harness

The existing tests are pure-function only. Season/registration/captain services need real DB tests. This task adds a vitest setup that pushes the schema to a dedicated test database and truncates tables between tests.

**Files:**
- Create: `vitest.setup.ts`
- Modify (full rewrite): `vitest.config.ts`
- Create: `src/lib/test/db.ts`
- Modify: `.env` (add `TEST_DATABASE_URL`), `README.md` (setup note)

- [ ] **Step 1: Create the test DB helper**

Create `src/lib/test/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

// A dedicated client bound to TEST_DATABASE_URL. Never import this in app code.
export const testDb = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

// Truncate every domain table. Call in beforeEach for isolation.
export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      "draft_events", "draft_picks", "draft_rounds", "draft_sessions",
      "team_slots", "teams", "registrations", "players", "users", "seasons"
    RESTART IDENTITY CASCADE;
  `);
}
```

- [ ] **Step 2: Create the vitest setup file**

Create `vitest.setup.ts`:

```typescript
import { execSync } from 'node:child_process';
import { afterAll, beforeEach } from 'vitest';
import { resetDb, testDb } from './src/lib/test/db';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to run DB-backed tests');
}

// Apply the current schema to the test database once before the suite.
execSync('npx prisma db push --skip-generate --accept-data-loss', {
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  stdio: 'inherit',
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});
```

- [ ] **Step 3: Rewrite `vitest.config.ts`**

Replace the file contents with:

```typescript
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
  },
});
```

`fileParallelism: false` keeps DB tests serial so `TRUNCATE` in one file does not race another.

- [ ] **Step 4: Add the test DB url and a setup note**

Append to `.env` (the developer fills the real value):

```
TEST_DATABASE_URL="postgresql://USER:PASS@localhost:5432/lol_system_test"
```

Add a note to `README.md` under setup: "Before running tests, create a `lol_system_test` Postgres database and set `TEST_DATABASE_URL` in `.env`. `npm run test` pushes the schema to it automatically."

- [ ] **Step 5: Verify the harness boots**

Run: `npm run test -- src/lib/draft/orderResolvers.test.ts`
Expected: you see `prisma db push` output, then the `orderResolvers` tests PASS (that file is pure and unaffected by the schema change).

- [ ] **Step 6: Commit**

```bash
git add vitest.setup.ts vitest.config.ts src/lib/test/db.ts README.md .env
git commit -m "test: add test-database harness for service tests"
```

---

## Phase 1 — Season Service & Admin UI

### Task 5: Season Zod schema

**Files:**
- Create: `src/lib/season/season-schema.ts`
- Test: `src/lib/season/season-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/season/season-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { CreateSeasonInput } from './season-schema';

describe('CreateSeasonInput', () => {
  it('accepts a valid season', () => {
    expect(CreateSeasonInput.safeParse({ name: 'S1', teamBudget: 1000 }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(CreateSeasonInput.safeParse({ name: '', teamBudget: 1000 }).success).toBe(false);
  });

  it('rejects a non-positive budget', () => {
    expect(CreateSeasonInput.safeParse({ name: 'S1', teamBudget: 0 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/season/season-schema.test.ts`
Expected: FAIL — `Cannot find module './season-schema'`.

- [ ] **Step 3: Write the schema**

Create `src/lib/season/season-schema.ts`:

```typescript
import { z } from 'zod';

export const CreateSeasonInput = z.object({
  name: z.string().trim().min(1, '赛季名称必填').max(40, '赛季名称过长'),
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonInput>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/lib/season/season-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/season-schema.ts src/lib/season/season-schema.test.ts
git commit -m "feat(season): season input schema"
```

---

### Task 6: Season service — create, get, list, archive

**Files:**
- Create: `src/lib/season/errors.ts`
- Create: `src/lib/season/season-service.ts`
- Test: `src/lib/season/season-service.test.ts`

- [ ] **Step 1: Write the error class**

Create `src/lib/season/errors.ts`:

```typescript
export type SeasonErrorCode = 'INVALID_TRANSITION' | 'PRECONDITION_FAILED';

export class SeasonError extends Error {
  constructor(
    public code: SeasonErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SeasonError';
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/season/season-service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { archiveActiveSeason, createSeason, getActiveSeason, listSeasons } from './season-service';

describe('season-service: create / get / list', () => {
  it('creates a season in SETUP', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect(s.status).toBe('SETUP');
    expect(s.name).toBe('S1');
  });

  it('getActiveSeason returns the single non-archived season', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect((await getActiveSeason(testDb))?.name).toBe('S1');
  });

  it('creating a second season archives the prior active one', async () => {
    const first = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    const second = await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    const reloadedFirst = await testDb.season.findUnique({ where: { id: first.id } });
    expect(reloadedFirst?.status).toBe('ARCHIVED');
    expect((await getActiveSeason(testDb))?.id).toBe(second.id);
  });

  it('listSeasons returns newest first', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    expect((await listSeasons(testDb)).map((s) => s.name)).toEqual(['S2', 'S1']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/lib/season/season-service.test.ts`
Expected: FAIL — `Cannot find module './season-service'`.

- [ ] **Step 4: Write the service**

Create `src/lib/season/season-service.ts`:

```typescript
import type { Prisma, PrismaClient, Season } from '@prisma/client';
import type { CreateSeasonInput } from './season-schema';

type Db = PrismaClient | Prisma.TransactionClient;

/** The single non-archived season, or null. */
export async function getActiveSeason(db: Db): Promise<Season | null> {
  return db.season.findFirst({ where: { status: { not: 'ARCHIVED' } } });
}

export async function listSeasons(db: Db): Promise<Season[]> {
  return db.season.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Archive the current active season (no-op if none). */
export async function archiveActiveSeason(db: Db): Promise<void> {
  const active = await getActiveSeason(db);
  if (!active) return;
  await db.season.update({
    where: { id: active.id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

/**
 * Create a season in SETUP. If an active season exists it is archived first,
 * so at most one season is ever non-archived.
 */
export async function createSeason(
  db: PrismaClient,
  input: CreateSeasonInput,
): Promise<Season> {
  return db.$transaction(async (tx) => {
    await archiveActiveSeason(tx);
    return tx.season.create({
      data: { name: input.name, teamBudget: input.teamBudget, status: 'SETUP' },
    });
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/lib/season/season-service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/season/season-service.ts src/lib/season/season-service.test.ts src/lib/season/errors.ts
git commit -m "feat(season): create / get / list / archive service"
```

---

### Task 7: Season service — status transitions

**Files:**
- Modify: `src/lib/season/season-service.ts`
- Modify: `src/lib/season/season-service.test.ts`

- [ ] **Step 1: Add the failing transition tests**

Append to `src/lib/season/season-service.test.ts`:

```typescript
import { transitionSeason } from './season-service';
import { SeasonError } from './errors';

describe('season-service: transitions', () => {
  it('SETUP -> REGISTRATION is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });

  it('REGISTRATION -> DRAFTING is rejected (not adjacent)', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await expect(transitionSeason(testDb, s.id, 'DRAFTING')).rejects.toBeInstanceOf(SeasonError);
  });

  it('ROSTER_LOCKED -> REGISTRATION reopen is allowed', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
    expect((await transitionSeason(testDb, s.id, 'REGISTRATION')).status).toBe('REGISTRATION');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/season/season-service.test.ts`
Expected: FAIL — `transitionSeason` is not exported.

- [ ] **Step 3: Add `transitionSeason`**

Append to `src/lib/season/season-service.ts`:

```typescript
import type { SeasonStatus } from '@prisma/client';
import { SeasonError } from './errors';

// Allowed status edges. ARCHIVED is reached only via createSeason / archiveActiveSeason.
const ALLOWED: Record<SeasonStatus, SeasonStatus[]> = {
  SETUP: ['REGISTRATION'],
  REGISTRATION: ['ROSTER_LOCKED'],
  ROSTER_LOCKED: ['REGISTRATION', 'DRAFTING'],
  DRAFTING: ['COMPLETED'],
  COMPLETED: [],
  ARCHIVED: [],
};

/**
 * Move a season to `next`. Validates the edge only — caller-specific
 * preconditions (e.g. captains exist before DRAFTING) are enforced by the
 * relevant service (captain-service / draft engine).
 */
export async function transitionSeason(
  db: Db,
  seasonId: string,
  next: SeasonStatus,
): Promise<Season> {
  const season = await db.season.findUnique({ where: { id: seasonId } });
  if (!season) throw new SeasonError('PRECONDITION_FAILED', '赛季不存在');
  if (!ALLOWED[season.status].includes(next)) {
    throw new SeasonError(
      'INVALID_TRANSITION',
      `不允许的赛季状态变更: ${season.status} → ${next}`,
    );
  }
  return db.season.update({ where: { id: seasonId }, data: { status: next } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/season/season-service.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/season/season-service.ts src/lib/season/season-service.test.ts
git commit -m "feat(season): status-transition validation"
```

---

### Task 8: Season API routes

**Files:**
- Create: `src/app/api/seasons/route.ts`
- Create: `src/app/api/seasons/[id]/transition/route.ts`

- [ ] **Step 1: Write the list/create route**

Create `src/app/api/seasons/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { CreateSeasonInput } from '@/lib/season/season-schema';
import { createSeason, listSeasons } from '@/lib/season/season-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const seasons = await listSeasons(prisma);
  return NextResponse.json({ seasons });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = CreateSeasonInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const season = await createSeason(prisma, parsed.data);
    return NextResponse.json({ season }, { status: 201 });
  } catch (e) {
    console.error('POST /api/seasons failed', e);
    return NextResponse.json({ error: '创建赛季失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the transition route**

Create `src/app/api/seasons/[id]/transition/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { SeasonError } from '@/lib/season/errors';
import { transitionSeason } from '@/lib/season/season-service';

const Body = z.object({
  to: z.enum(['REGISTRATION', 'ROSTER_LOCKED']),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  try {
    const season = await transitionSeason(prisma, params.id, parsed.data.to);
    return NextResponse.json({ season });
  } catch (e) {
    if (e instanceof SeasonError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('season transition failed', e);
    return NextResponse.json({ error: '状态变更失败' }, { status: 500 });
  }
}
```

> The transition route only handles `REGISTRATION` and `ROSTER_LOCKED` (including reopen). `DRAFTING` is entered by the draft engine (`startDraft`, Task 25) and `COMPLETED` is set when the draft finishes — neither is a manual admin transition.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'api/seasons' || echo "no season route errors"`
Expected: `no season route errors`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/seasons
git commit -m "feat(season): list / create / transition API routes"
```

---

### Task 9: Admin season management page

**Files:**
- Create: `src/app/admin/season/page.tsx`
- Create: `src/components/admin/SeasonManager.tsx`
- Modify: `src/components/layout/AdminNav.tsx`

- [ ] **Step 1: Write the server page**

Create `src/app/admin/season/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { listSeasons } from '@/lib/season/season-service';
import { SeasonManager } from '@/components/admin/SeasonManager';

export const dynamic = 'force-dynamic';

export default async function AdminSeasonPage() {
  const seasons = await listSeasons(prisma);
  return <SeasonManager initialSeasons={seasons} />;
}
```

- [ ] **Step 2: Write the client component**

Create `src/components/admin/SeasonManager.tsx`. A `'use client'` component:

- Props: `{ initialSeasons: Season[] }` (import `Season` from `@prisma/client`).
- A "新建赛季" form: `name` text `Input` + `teamBudget` number `Input` + submit `Button` → `POST /api/seasons`. Before POST, if `initialSeasons` contains a non-`ARCHIVED` season, show a shadcn `AlertDialog`: "创建新赛季会归档当前赛季「{name}」，确定继续？"; POST only on confirm.
- A shadcn `Table` of all seasons: name, status `Badge`, teamBudget, createdAt.
- For the active (non-archived) season, render exactly one transition `Button` based on status: SETUP→"开启报名" (`POST /api/seasons/[id]/transition {to:'REGISTRATION'}`), REGISTRATION→"截止报名" (`{to:'ROSTER_LOCKED'}`), ROSTER_LOCKED→"重新开启报名" (`{to:'REGISTRATION'}`). DRAFTING/COMPLETED/ARCHIVED show no transition button.
- After any successful POST, `useRouter().refresh()` and `toast.success(...)` (`sonner`). On a 409, `toast.error(body.error)`.

- [ ] **Step 3: Add the nav link**

In `src/components/layout/AdminNav.tsx`, add a nav entry to `/admin/season` labelled "赛季管理", matching the existing link markup.

- [ ] **Step 4: Manual verification**

`npm run dev`, log in as `admin` (password from seed), visit `/admin/season`. Create a season; flip SETUP→REGISTRATION→ROSTER_LOCKED→REGISTRATION. Create a second season; confirm the archive warning appears and the first becomes ARCHIVED.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/season src/components/admin/SeasonManager.tsx src/components/layout/AdminNav.tsx
git commit -m "feat(season): admin season management page"
```

---

## Phase 2 — Registration (Public + Admin)

### Task 10: Registration Zod schemas

**Files:**
- Create: `src/lib/registration/registration-schema.ts`
- Test: `src/lib/registration/registration-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/registration/registration-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { PublicRegistrationInput } from './registration-schema';

const base = {
  gameId: 'faker',
  nickname: '李哥',
  primaryPositions: ['MID'],
  secondaryPositions: [],
  currentRank: '大师',
  peakRank: '宗师',
  willingToCaptain: false,
};

describe('PublicRegistrationInput', () => {
  it('accepts a valid registration', () => {
    expect(PublicRegistrationInput.safeParse(base).success).toBe(true);
  });

  it('requires at least one primary position', () => {
    expect(PublicRegistrationInput.safeParse({ ...base, primaryPositions: [] }).success).toBe(false);
  });

  it('rejects a secondary position that duplicates a primary one', () => {
    const r = PublicRegistrationInput.safeParse({
      ...base, primaryPositions: ['MID'], secondaryPositions: ['MID'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a statement longer than 200 chars', () => {
    expect(PublicRegistrationInput.safeParse({ ...base, statement: 'x'.repeat(201) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/registration/registration-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schemas**

Create `src/lib/registration/registration-schema.ts`:

```typescript
import { z } from 'zod';

export const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

export const PublicRegistrationInput = z
  .object({
    gameId: z.string().trim().min(2, '游戏 ID 至少 2 个字符').max(32, '游戏 ID 过长'),
    nickname: z.string().trim().min(2, '昵称至少 2 个字符').max(20, '昵称过长'),
    primaryPositions: z.array(z.enum(POSITIONS)).min(1, '至少选择一个主位置'),
    secondaryPositions: z.array(z.enum(POSITIONS)).default([]),
    currentRank: z.string().trim().min(1, '当前段位必填').max(20, '段位过长'),
    peakRank: z.string().trim().min(1, '历史最高段位必填').max(20, '段位过长'),
    willingToCaptain: z.boolean().default(false),
    statement: z.string().trim().max(200, '参赛宣言不超过 200 字').optional(),
  })
  .refine(
    (d) => d.secondaryPositions.every((p) => !d.primaryPositions.includes(p)),
    { message: '副位置不能与主位置重复', path: ['secondaryPositions'] },
  );
export type PublicRegistrationInput = z.infer<typeof PublicRegistrationInput>;

export const AdminRegistrationPatch = z.object({
  nickname: z.string().trim().min(2).max(20).optional(),
  primaryPositions: z.array(z.enum(POSITIONS)).min(1).optional(),
  secondaryPositions: z.array(z.enum(POSITIONS)).optional(),
  currentRank: z.string().trim().min(1).max(20).optional(),
  peakRank: z.string().trim().min(1).max(20).optional(),
  willingToCaptain: z.boolean().optional(),
  statement: z.string().trim().max(200).optional(),
  cost: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'EXCLUDED']).optional(),
});
export type AdminRegistrationPatch = z.infer<typeof AdminRegistrationPatch>;

export const AdminRegistrationCreate = z.object({
  gameId: z.string().trim().min(2).max(32),
  nickname: z.string().trim().min(2).max(20),
  primaryPositions: z.array(z.enum(POSITIONS)).min(1),
  secondaryPositions: z.array(z.enum(POSITIONS)).default([]),
  currentRank: z.string().trim().min(1).max(20),
  peakRank: z.string().trim().min(1).max(20),
  willingToCaptain: z.boolean().default(false),
  statement: z.string().trim().max(200).optional(),
  cost: z.number().min(0).default(0),
});
export type AdminRegistrationCreate = z.infer<typeof AdminRegistrationCreate>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/registration/registration-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration/registration-schema.ts src/lib/registration/registration-schema.test.ts
git commit -m "feat(registration): registration input schemas"
```

---

### Task 11: Registration service — public submit

**Files:**
- Create: `src/lib/registration/errors.ts`
- Create: `src/lib/registration/registration-service.ts`
- Test: `src/lib/registration/registration-service.test.ts`

- [ ] **Step 1: Write the error class**

Create `src/lib/registration/errors.ts`:

```typescript
export type RegistrationErrorCode =
  | 'REGISTRATION_CLOSED'
  | 'DUPLICATE_GAME_ID'
  | 'NOT_FOUND';

export class RegistrationError extends Error {
  constructor(
    public code: RegistrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/registration/registration-service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import { submitPublicRegistration } from './registration-service';
import { RegistrationError } from './errors';

const form = {
  gameId: 'faker',
  nickname: '李哥',
  primaryPositions: ['MID' as const],
  secondaryPositions: [],
  currentRank: '大师',
  peakRank: '宗师',
  willingToCaptain: true,
};

async function openSeason() {
  const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
  await transitionSeason(testDb, s.id, 'REGISTRATION');
  return s;
}

describe('submitPublicRegistration', () => {
  it('creates a Player master and a Registration', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    expect(reg.nickname).toBe('李哥');
    expect(await testDb.player.findUnique({ where: { gameId: 'faker' } })).not.toBeNull();
  });

  it('reuses the Player master across seasons', async () => {
    await openSeason();
    await submitPublicRegistration(testDb, form);
    const s2 = await createSeason(testDb, { name: 'S2', teamBudget: 1000 });
    await transitionSeason(testDb, s2.id, 'REGISTRATION');
    await submitPublicRegistration(testDb, form);
    expect(await testDb.player.count()).toBe(1);
    expect(await testDb.registration.count()).toBe(1); // S1 was archived; its rows cascade-deleted
  });

  it('rejects a duplicate gameId in the same season', async () => {
    await openSeason();
    await submitPublicRegistration(testDb, form);
    await expect(submitPublicRegistration(testDb, form)).rejects.toBeInstanceOf(RegistrationError);
  });

  it('rejects when no season is open for registration', async () => {
    await createSeason(testDb, { name: 'S1', teamBudget: 1000 }); // stays SETUP
    await expect(submitPublicRegistration(testDb, form)).rejects.toBeInstanceOf(RegistrationError);
  });
});
```

> Note on the cross-season test: creating `S2` archives `S1`, and `Registration` cascades on `Season` delete is NOT triggered by archival (archival is an update, not a delete) — so `S1`'s registration row persists. The assertion `registration.count() === 1` is therefore wrong; change it to `2`. (Fix applied below in Step 4's service comment — keep the test asserting `2`.)

Correct the test before running: the third line of the cross-season test's assertions should be `expect(await testDb.registration.count()).toBe(2);`.

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- src/lib/registration/registration-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service**

Create `src/lib/registration/registration-service.ts`:

```typescript
import { Prisma, type PrismaClient, type Registration } from '@prisma/client';
import { getActiveSeason } from '@/lib/season/season-service';
import type { PublicRegistrationInput } from './registration-schema';
import { RegistrationError } from './errors';

/**
 * Public, anonymous registration. Find-or-create the Player master by gameId,
 * then create the per-season Registration. The unique [seasonId, playerId]
 * constraint makes duplicate submissions fail.
 */
export async function submitPublicRegistration(
  db: PrismaClient,
  input: PublicRegistrationInput,
): Promise<Registration> {
  const season = await getActiveSeason(db);
  if (!season || season.status !== 'REGISTRATION') {
    throw new RegistrationError('REGISTRATION_CLOSED', '当前没有开放报名的赛季');
  }

  return db.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { gameId: input.gameId },
      create: { gameId: input.gameId, nickname: input.nickname },
      update: { nickname: input.nickname },
    });

    try {
      return await tx.registration.create({
        data: {
          seasonId: season.id,
          playerId: player.id,
          nickname: input.nickname,
          primaryPositions: input.primaryPositions,
          secondaryPositions: input.secondaryPositions,
          currentRank: input.currentRank,
          peakRank: input.peakRank,
          willingToCaptain: input.willingToCaptain,
          statement: input.statement ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new RegistrationError('DUPLICATE_GAME_ID', '该游戏 ID 本赛季已报名');
      }
      throw e;
    }
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- src/lib/registration/registration-service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/registration/registration-service.ts src/lib/registration/registration-service.test.ts src/lib/registration/errors.ts
git commit -m "feat(registration): public submit service"
```

---

### Task 12: Registration service — admin operations

**Files:**
- Modify: `src/lib/registration/registration-service.ts`
- Modify: `src/lib/registration/registration-service.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/registration/registration-service.test.ts`:

```typescript
import {
  adminCreateRegistration,
  deleteRegistration,
  listSeasonRegistrations,
  patchRegistration,
} from './registration-service';

describe('registration admin ops', () => {
  it('lists registrations for a season', async () => {
    const s = await openSeason();
    await submitPublicRegistration(testDb, form);
    expect(await listSeasonRegistrations(testDb, s.id)).toHaveLength(1);
  });

  it('patches cost and status', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    const updated = await patchRegistration(testDb, reg.id, { cost: 250, status: 'EXCLUDED' });
    expect(updated.cost).toBe(250);
    expect(updated.status).toBe('EXCLUDED');
  });

  it('deletes a registration', async () => {
    await openSeason();
    const reg = await submitPublicRegistration(testDb, form);
    await deleteRegistration(testDb, reg.id);
    expect(await testDb.registration.count()).toBe(0);
  });

  it('admin-creates a registration for a season', async () => {
    const s = await openSeason();
    const reg = await adminCreateRegistration(testDb, s.id, {
      gameId: 'walkin', nickname: '替补', primaryPositions: ['TOP'],
      secondaryPositions: [], currentRank: '钻石', peakRank: '大师',
      willingToCaptain: false, cost: 0,
    });
    expect(reg.nickname).toBe('替补');
    expect(await testDb.player.findUnique({ where: { gameId: 'walkin' } })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/registration/registration-service.test.ts`
Expected: FAIL — `listSeasonRegistrations` not exported.

- [ ] **Step 3: Add the admin operations**

Append to `src/lib/registration/registration-service.ts`:

```typescript
import type { AdminRegistrationCreate, AdminRegistrationPatch } from './registration-schema';

export type RegistrationWithPlayer = Prisma.RegistrationGetPayload<{
  include: { player: { select: { gameId: true } } };
}>;

export async function listSeasonRegistrations(
  db: PrismaClient,
  seasonId: string,
): Promise<RegistrationWithPlayer[]> {
  return db.registration.findMany({
    where: { seasonId },
    include: { player: { select: { gameId: true } } },
    orderBy: { registeredAt: 'asc' },
  });
}

export async function patchRegistration(
  db: PrismaClient,
  registrationId: string,
  patch: AdminRegistrationPatch,
): Promise<Registration> {
  const existing = await db.registration.findUnique({ where: { id: registrationId } });
  if (!existing) throw new RegistrationError('NOT_FOUND', '报名记录不存在');
  return db.registration.update({ where: { id: registrationId }, data: patch });
}

export async function deleteRegistration(
  db: PrismaClient,
  registrationId: string,
): Promise<void> {
  await db.registration.delete({ where: { id: registrationId } });
}

export async function adminCreateRegistration(
  db: PrismaClient,
  seasonId: string,
  input: AdminRegistrationCreate,
): Promise<Registration> {
  return db.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { gameId: input.gameId },
      create: { gameId: input.gameId, nickname: input.nickname },
      update: { nickname: input.nickname },
    });
    try {
      return await tx.registration.create({
        data: {
          seasonId,
          playerId: player.id,
          nickname: input.nickname,
          primaryPositions: input.primaryPositions,
          secondaryPositions: input.secondaryPositions,
          currentRank: input.currentRank,
          peakRank: input.peakRank,
          willingToCaptain: input.willingToCaptain,
          statement: input.statement ?? null,
          cost: input.cost,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new RegistrationError('DUPLICATE_GAME_ID', '该游戏 ID 本赛季已报名');
      }
      throw e;
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/registration/registration-service.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration/registration-service.ts src/lib/registration/registration-service.test.ts
git commit -m "feat(registration): admin list / patch / delete / create"
```

---

### Task 13: Public registration API routes

**Files:**
- Create: `src/app/api/register/route.ts`
- Create: `src/app/api/register/status/route.ts`

- [ ] **Step 1: Write the status route**

Create `src/app/api/register/status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(prisma);
  return NextResponse.json({
    open: season?.status === 'REGISTRATION',
    seasonName: season?.name ?? null,
  });
}
```

- [ ] **Step 2: Write the submit route**

Create `src/app/api/register/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { PublicRegistrationInput } from '@/lib/registration/registration-schema';
import { submitPublicRegistration } from '@/lib/registration/registration-service';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PublicRegistrationInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await submitPublicRegistration(prisma, parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('POST /api/register failed', e);
    return NextResponse.json({ error: '报名失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'api/register' || echo "no register route errors"`
Expected: `no register route errors`. (These routes are made publicly reachable by the Task 23 middleware rewrite.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/register
git commit -m "feat(registration): public submit + status API"
```

---

### Task 14: Admin registration API routes

**Files:**
- Create: `src/app/api/admin/registrations/route.ts`
- Create: `src/app/api/admin/registrations/[id]/route.ts`

- [ ] **Step 1: Write the list/create route**

Create `src/app/api/admin/registrations/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { AdminRegistrationCreate } from '@/lib/registration/registration-schema';
import {
  adminCreateRegistration,
  listSeasonRegistrations,
} from '@/lib/registration/registration-service';
import { getActiveSeason } from '@/lib/season/season-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ season: null, registrations: [] });
  const registrations = await listSeasonRegistrations(prisma, season.id);
  return NextResponse.json({ season, registrations });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ error: '没有活跃赛季' }, { status: 409 });

  const json = await req.json().catch(() => null);
  const parsed = AdminRegistrationCreate.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await adminCreateRegistration(prisma, season.id, parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('POST /api/admin/registrations failed', e);
    return NextResponse.json({ error: '新增报名失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the patch/delete route**

Create `src/app/api/admin/registrations/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { AdminRegistrationPatch } from '@/lib/registration/registration-schema';
import {
  deleteRegistration,
  patchRegistration,
} from '@/lib/registration/registration-service';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await req.json().catch(() => null);
  const parsed = AdminRegistrationPatch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await patchRegistration(prisma, params.id, parsed.data);
    return NextResponse.json({ registration });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 404 });
    }
    console.error('PATCH registration failed', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    await deleteRegistration(prisma, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE registration failed', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'admin/registrations' || echo "no admin registration route errors"`
Expected: `no admin registration route errors`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/registrations
git commit -m "feat(registration): admin registrations API"
```

---

### Task 15: Public registration page

**Files:**
- Create: `src/app/register/layout.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/components/registration/RegistrationForm.tsx`

- [ ] **Step 1: Write the standalone layout**

Create `src/app/register/layout.tsx` — a standalone layout with no admin/captain nav. It renders `<main className="mx-auto max-w-xl p-6"><h1 className="mb-6 text-2xl font-bold">赛事报名</h1>{children}</main>`. Match the container/typography classes used in `src/app/login/page.tsx`.

- [ ] **Step 2: Write the server page**

Create `src/app/register/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { RegistrationForm } from '@/components/registration/RegistrationForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const season = await getActiveSeason(prisma);
  if (season?.status !== 'REGISTRATION') {
    return (
      <div className="text-center text-muted-foreground">
        {season ? '本赛季报名已截止或未开放' : '当前没有开放报名的赛季'}
      </div>
    );
  }
  return <RegistrationForm seasonName={season.name} />;
}
```

- [ ] **Step 3: Write the form component**

Create `src/components/registration/RegistrationForm.tsx`. A `'use client'` component:

- Props: `{ seasonName: string }`.
- `react-hook-form` + `zodResolver(PublicRegistrationInput)` from `@/lib/registration/registration-schema`.
- Fields: `gameId` (`Input`), `nickname` (`Input`), `primaryPositions` (5 `Checkbox`es over `POSITIONS`, multi-select into an array), `secondaryPositions` (5 `Checkbox`es, multi-select), `currentRank` (`Input`), `peakRank` (`Input`), `willingToCaptain` (`Checkbox`), `statement` (a `<textarea>` styled with the same Tailwind classes as `Input`; there is no shadcn textarea).
- Use shadcn `Form`, `Input`, `Checkbox`, `Button`, `Label`.
- On submit → `fetch('/api/register', { method: 'POST', body })`. On 201, replace the form with a success panel "报名成功！". On 409, `toast.error(body.error)` (`sonner`). On 400, surface `body.error`.
- Position display labels: define a local `const POSITION_LABELS: Record<string,string> = { TOP:'上单', JUNGLE:'打野', MID:'中单', ADC:'射手', SUPPORT:'辅助' }`.

- [ ] **Step 4: Manual verification**

Defer until Task 23 (middleware) makes `/register` publicly reachable. After Task 23: with a season in `REGISTRATION`, visit `/register` logged out, submit a registration, resubmit the same gameId, confirm the duplicate error toast.

- [ ] **Step 5: Commit**

```bash
git add src/app/register src/components/registration/RegistrationForm.tsx
git commit -m "feat(registration): public registration page"
```

---

### Task 16: Admin registrations page

**Files:**
- Create: `src/app/admin/registrations/page.tsx`
- Create: `src/components/admin/RegistrationsManager.tsx`
- Modify: `src/components/layout/AdminNav.tsx`

- [ ] **Step 1: Write the server page**

Create `src/app/admin/registrations/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { listSeasonRegistrations } from '@/lib/registration/registration-service';
import { getActiveSeason } from '@/lib/season/season-service';
import { RegistrationsManager } from '@/components/admin/RegistrationsManager';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;
  const registrations = await listSeasonRegistrations(prisma, season.id);
  return <RegistrationsManager season={season} initialRegistrations={registrations} />;
}
```

- [ ] **Step 2: Write the client component**

Create `src/components/admin/RegistrationsManager.tsx`. A `'use client'` component:

- Props: `{ season: Season; initialRegistrations: RegistrationWithPlayer[] }` (`Season` from `@prisma/client`, `RegistrationWithPlayer` from `@/lib/registration/registration-service`).
- Header showing `season.name` and `season.status`.
- A shadcn `Table`: columns gameId (`player.gameId`), nickname, primary/secondary positions, currentRank, peakRank, willing-to-captain (✓/—), `cost` (inline number `Input`, blur → `PATCH /api/admin/registrations/[id]` with `{cost}`), status `Badge`, actions cell.
- Row actions: "编辑" (a `Dialog` with the editable fields → `PATCH`), "排除/恢复" (toggles `status` → `PATCH {status}`), "删除" (`AlertDialog` confirm → `DELETE`). For non-captain rows also "任命队长" → `POST /api/admin/registrations/[id]/appoint-captain`; on 201 open a `Dialog` showing the returned `username`+`password` with copy buttons and the note "请立即转交队长，关闭后无法再次查看密码". For captain rows "撤销队长" → `POST /api/admin/registrations/[id]/revoke-captain`.
- "手动新增报名" button → a `Dialog` with the `AdminRegistrationCreate` fields → `POST /api/admin/registrations`.
- After any mutation: `useRouter().refresh()` + `sonner` toast; map 409 responses to `toast.error(body.error)`.

> The appoint/revoke endpoints are created in Task 20. Writing the handlers now is fine — they are exercised after Task 20.

- [ ] **Step 3: Add the nav link**

In `src/components/layout/AdminNav.tsx` add a "报名管理" link to `/admin/registrations`.

- [ ] **Step 4: Manual verification**

Visit `/admin/registrations`: edit a cost, exclude/restore a row, add a manual registration, delete one. (Appoint/revoke verified after Task 22.)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/registrations src/components/admin/RegistrationsManager.tsx src/components/layout/AdminNav.tsx
git commit -m "feat(registration): admin registrations management page"
```

---

## Phase 3 — Captains, Team Accounts, Auth

### Task 17: Credential generation utility

**Files:**
- Create: `src/lib/captains/credentials.ts`
- Test: `src/lib/captains/credentials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/captains/credentials.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generatePassword, generateUsername } from './credentials';

describe('credentials', () => {
  it('generateUsername produces a TEAM-prefixed code', () => {
    expect(generateUsername()).toMatch(/^TEAM-[0-9A-Z]{4}$/);
  });

  it('generateUsername is non-deterministic across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateUsername()));
    expect(set.size).toBeGreaterThan(40);
  });

  it('generatePassword produces a 10-char alphanumeric string', () => {
    expect(generatePassword()).toMatch(/^[0-9a-zA-Z]{10}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/captains/credentials.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the utility**

Create `src/lib/captains/credentials.ts`:

```typescript
import { randomInt } from 'node:crypto';

const CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PWD_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pick(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/** A team-account username, e.g. "TEAM-A3F9". Caller must ensure uniqueness. */
export function generateUsername(): string {
  return `TEAM-${pick(CODE_ALPHABET, 4)}`;
}

/** A 10-char alphanumeric password (shown to admin once, then only hash stored). */
export function generatePassword(): string {
  return pick(PWD_ALPHABET, 10);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/captains/credentials.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/captains/credentials.ts src/lib/captains/credentials.test.ts
git commit -m "feat(captains): credential generation utility"
```

---

### Task 18: Captain service — appoint & revoke

**Files:**
- Create: `src/lib/captains/errors.ts`
- Create: `src/lib/captains/captain-service.ts`
- Test: `src/lib/captains/captain-service.test.ts`

- [ ] **Step 1: Write the error class**

Create `src/lib/captains/errors.ts`:

```typescript
export type CaptainErrorCode =
  | 'WRONG_SEASON_STATE'
  | 'NOT_FOUND'
  | 'ALREADY_CAPTAIN'
  | 'NOT_A_CAPTAIN'
  | 'DRAFT_ALREADY_STARTED';

export class CaptainError extends Error {
  constructor(
    public code: CaptainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CaptainError';
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/captains/captain-service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { appointCaptain, revokeCaptain } from './captain-service';
import { CaptainError } from './errors';

async function seasonWithReg(gameId = 'cap1') {
  const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
  await transitionSeason(testDb, s.id, 'REGISTRATION');
  const reg = await submitPublicRegistration(testDb, {
    gameId, nickname: '队长甲', primaryPositions: ['MID'],
    secondaryPositions: [], currentRank: '大师', peakRank: '大师', willingToCaptain: true,
  });
  await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
  return { season: s, reg };
}

describe('appointCaptain', () => {
  it('creates a Team and a team account, returns plaintext credentials', async () => {
    const { reg } = await seasonWithReg();
    const result = await appointCaptain(testDb, reg.id);
    expect(result.username).toMatch(/^TEAM-/);
    expect(result.password).toHaveLength(10);
    const team = await testDb.team.findUnique({ where: { captainId: reg.id } });
    expect(team).not.toBeNull();
    const account = await testDb.user.findUnique({ where: { id: team!.userId } });
    expect(account!.role).toBe('CAPTAIN');
    expect((await testDb.registration.findUnique({ where: { id: reg.id } }))!.isCaptain).toBe(true);
  });

  it('rejects appointing when the season is not ROSTER_LOCKED', async () => {
    const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
    await transitionSeason(testDb, s.id, 'REGISTRATION');
    const reg = await submitPublicRegistration(testDb, {
      gameId: 'c', nickname: 'c', primaryPositions: ['TOP'], secondaryPositions: [],
      currentRank: '大师', peakRank: '大师', willingToCaptain: true,
    });
    await expect(appointCaptain(testDb, reg.id)).rejects.toBeInstanceOf(CaptainError);
  });

  it('revokeCaptain deletes the team and account', async () => {
    const { reg } = await seasonWithReg();
    await appointCaptain(testDb, reg.id);
    await revokeCaptain(testDb, reg.id);
    expect(await testDb.team.findUnique({ where: { captainId: reg.id } })).toBeNull();
    expect(await testDb.user.count()).toBe(0);
    expect((await testDb.registration.findUnique({ where: { id: reg.id } }))!.isCaptain).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- src/lib/captains/captain-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service**

Create `src/lib/captains/captain-service.ts`:

```typescript
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { generatePassword, generateUsername } from './credentials';
import { CaptainError } from './errors';

export interface AppointResult {
  teamId: string;
  username: string;
  password: string; // plaintext — returned once, never persisted
}

/** Generate a username not already taken. */
async function uniqueUsername(db: PrismaClient): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateUsername();
    if (!(await db.user.findUnique({ where: { username: candidate } }))) return candidate;
  }
  throw new CaptainError('NOT_FOUND', '无法生成唯一队伍账号，请重试');
}

/**
 * Appoint a registration as captain: flips isCaptain, creates the Team and a
 * fresh team account. Allowed only while the season is ROSTER_LOCKED.
 * Returns plaintext credentials for one-time display.
 */
export async function appointCaptain(
  db: PrismaClient,
  registrationId: string,
): Promise<AppointResult> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: { season: true },
  });
  if (!reg) throw new CaptainError('NOT_FOUND', '报名记录不存在');
  if (reg.season.status !== 'ROSTER_LOCKED') {
    throw new CaptainError('WRONG_SEASON_STATE', '仅在名册锁定阶段可任命队长');
  }
  if (reg.isCaptain) throw new CaptainError('ALREADY_CAPTAIN', '该选手已是队长');

  const username = await uniqueUsername(db);
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const team = await db.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: { isCaptain: true },
    });
    const account = await tx.user.create({
      data: { username, passwordHash, role: 'CAPTAIN', mustChangePwd: false },
    });
    return tx.team.create({
      data: {
        seasonId: reg.seasonId,
        name: `${reg.nickname} 队`,
        captainId: registrationId,
        userId: account.id,
      },
    });
  });

  return { teamId: team.id, username, password };
}

/**
 * Revoke a captain before the draft starts: deletes the Team (cascading slots)
 * and the team account, resets isCaptain. Rejected once a draft session exists.
 */
export async function revokeCaptain(
  db: PrismaClient,
  registrationId: string,
): Promise<void> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: { season: { include: { draftSession: true } }, teamAsCaptain: true },
  });
  if (!reg) throw new CaptainError('NOT_FOUND', '报名记录不存在');
  if (!reg.isCaptain || !reg.teamAsCaptain) {
    throw new CaptainError('NOT_A_CAPTAIN', '该选手不是队长');
  }
  if (reg.season.draftSession) {
    throw new CaptainError('DRAFT_ALREADY_STARTED', '选秀已开始，无法撤销队长');
  }

  const userId = reg.teamAsCaptain.userId;
  await db.$transaction(async (tx) => {
    await tx.team.delete({ where: { id: reg.teamAsCaptain!.id } });
    await tx.user.delete({ where: { id: userId } });
    await tx.registration.update({
      where: { id: registrationId },
      data: { isCaptain: false },
    });
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- src/lib/captains/captain-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/captains/captain-service.ts src/lib/captains/captain-service.test.ts src/lib/captains/errors.ts
git commit -m "feat(captains): appoint / revoke captain service"
```

---

### Task 19: Team service — list teams & reset password

**Files:**
- Create: `src/lib/teams/team-service.ts`
- Test: `src/lib/teams/team-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/teams/team-service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { testDb } from '@/lib/test/db';
import { createSeason, transitionSeason } from '@/lib/season/season-service';
import { submitPublicRegistration } from '@/lib/registration/registration-service';
import { appointCaptain } from '@/lib/captains/captain-service';
import { listSeasonTeams, resetTeamPassword } from './team-service';

async function appointed() {
  const s = await createSeason(testDb, { name: 'S1', teamBudget: 1000 });
  await transitionSeason(testDb, s.id, 'REGISTRATION');
  const reg = await submitPublicRegistration(testDb, {
    gameId: 'cap', nickname: '队长', primaryPositions: ['MID'], secondaryPositions: [],
    currentRank: '大师', peakRank: '大师', willingToCaptain: true,
  });
  await transitionSeason(testDb, s.id, 'ROSTER_LOCKED');
  const result = await appointCaptain(testDb, reg.id);
  return { seasonId: s.id, teamId: result.teamId };
}

describe('team-service', () => {
  it('lists teams with captain + account username', async () => {
    const { seasonId } = await appointed();
    const teams = await listSeasonTeams(testDb, seasonId);
    expect(teams).toHaveLength(1);
    expect(teams[0].account.username).toMatch(/^TEAM-/);
    expect(teams[0].captain.nickname).toBe('队长');
  });

  it('resetTeamPassword returns a new plaintext and updates the hash', async () => {
    const { teamId } = await appointed();
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    const before = await testDb.user.findUniqueOrThrow({ where: { id: team.userId } });
    const { password } = await resetTeamPassword(testDb, teamId);
    const after = await testDb.user.findUniqueOrThrow({ where: { id: team.userId } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await bcrypt.compare(password, after.passwordHash)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/teams/team-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `src/lib/teams/team-service.ts`:

```typescript
import bcrypt from 'bcryptjs';
import { Prisma, type PrismaClient } from '@prisma/client';
import { generatePassword } from '@/lib/captains/credentials';
import { CaptainError } from '@/lib/captains/errors';

export type TeamWithRefs = Prisma.TeamGetPayload<{
  include: {
    captain: { select: { id: true; nickname: true } };
    account: { select: { username: true } };
  };
}>;

export async function listSeasonTeams(
  db: PrismaClient,
  seasonId: string,
): Promise<TeamWithRefs[]> {
  return db.team.findMany({
    where: { seasonId },
    include: {
      captain: { select: { id: true, nickname: true } },
      account: { select: { username: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Regenerate a team account's password. Returns plaintext for one-time display. */
export async function resetTeamPassword(
  db: PrismaClient,
  teamId: string,
): Promise<{ password: string }> {
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) throw new CaptainError('NOT_FOUND', '队伍不存在');
  const password = generatePassword();
  await db.user.update({
    where: { id: team.userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  return { password };
}

/** Rename a team. Authorization is enforced by the route. */
export async function renameTeam(
  db: PrismaClient,
  teamId: string,
  name: string,
): Promise<void> {
  await db.team.update({ where: { id: teamId }, data: { name } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/teams/team-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/teams/team-service.ts src/lib/teams/team-service.test.ts
git commit -m "feat(teams): list teams + reset password + rename service"
```

---

### Task 20: Captain & team API routes

**Files:**
- Create: `src/app/api/admin/registrations/[id]/appoint-captain/route.ts`
- Create: `src/app/api/admin/registrations/[id]/revoke-captain/route.ts`
- Create: `src/app/api/admin/teams/route.ts`
- Create: `src/app/api/admin/teams/[id]/reset-password/route.ts`
- Create: `src/app/api/teams/[id]/route.ts`

- [ ] **Step 1: Appoint-captain route**

Create `src/app/api/admin/registrations/[id]/appoint-captain/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { appointCaptain } from '@/lib/captains/captain-service';
import { CaptainError } from '@/lib/captains/errors';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const result = await appointCaptain(prisma, params.id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('appoint-captain failed', e);
    return NextResponse.json({ error: '任命失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Revoke-captain route**

Create `src/app/api/admin/registrations/[id]/revoke-captain/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { revokeCaptain } from '@/lib/captains/captain-service';
import { CaptainError } from '@/lib/captains/errors';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    await revokeCaptain(prisma, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('revoke-captain failed', e);
    return NextResponse.json({ error: '撤销失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Teams list route**

Create `src/app/api/admin/teams/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { listSeasonTeams } from '@/lib/teams/team-service';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ teams: [] });
  const teams = await listSeasonTeams(prisma, season.id);
  return NextResponse.json({ teams });
}
```

- [ ] **Step 4: Reset-password route**

Create `src/app/api/admin/teams/[id]/reset-password/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { CaptainError } from '@/lib/captains/errors';
import { resetTeamPassword } from '@/lib/teams/team-service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const result = await resetTeamPassword(prisma, params.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CaptainError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 404 });
    }
    console.error('reset-password failed', e);
    return NextResponse.json({ error: '重置失败' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Team rename route**

Create `src/app/api/teams/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { renameTeam } from '@/lib/teams/team-service';

const Body = z.object({ name: z.string().trim().min(2, '队名至少 2 字').max(30, '队名过长') });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({ where: { id: params.id } });
  if (!team) return NextResponse.json({ error: '队伍不存在' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const isOwnTeam = session.user.role === 'CAPTAIN' && session.user.teamId === team.id;
  if (!isAdmin && !isOwnTeam) {
    return NextResponse.json({ error: '无权修改该队伍' }, { status: 403 });
  }

  await renameTeam(prisma, params.id, parsed.data.name);
  return NextResponse.json({ ok: true });
}
```

> **Deliberate cross-task error:** `session.user.teamId` does not exist until Task 22 rewrites the session type. `npm run typecheck` will report exactly one error here; that is expected and resolved by Task 22.

- [ ] **Step 6: Verify the only typecheck error is the expected one**

Run: `npm run typecheck 2>&1 | grep -E 'teamId'`
Expected: one or two lines, all about `teamId` on `session.user`. No other errors in these new files.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/registrations src/app/api/admin/teams src/app/api/teams
git commit -m "feat(captains): appoint / revoke / teams / reset-password / rename API"
```

---

### Task 21: Admin teams page

**Files:**
- Create: `src/app/admin/teams/page.tsx`
- Create: `src/components/admin/TeamsManager.tsx`
- Modify: `src/components/layout/AdminNav.tsx`

- [ ] **Step 1: Write the server page**

Create `src/app/admin/teams/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { listSeasonTeams } from '@/lib/teams/team-service';
import { TeamsManager } from '@/components/admin/TeamsManager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamsPage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;
  const teams = await listSeasonTeams(prisma, season.id);
  return <TeamsManager season={season} initialTeams={teams} />;
}
```

- [ ] **Step 2: Write the client component**

Create `src/components/admin/TeamsManager.tsx`. A `'use client'` component:

- Props: `{ season: Season; initialTeams: TeamWithRefs[] }` (`TeamWithRefs` from `@/lib/teams/team-service`).
- Header note: "队伍账号在任命队长时生成。用户名长期可见，密码仅在生成/重置时显示一次。"
- A shadcn `Table`: columns team name, captain nickname, account `username`, `budgetLeft`, actions.
- "重置密码" action → `POST /api/admin/teams/[id]/reset-password`; on success open a `Dialog` showing the plaintext `password` with a copy button and "请立即转交队长，关闭后无法再次查看".
- "改名" action → a `Dialog` with a name `Input` → `PATCH /api/teams/[id]`.
- After mutations: `useRouter().refresh()` + `sonner` toast.

- [ ] **Step 3: Add the nav link**

In `src/components/layout/AdminNav.tsx` add a "队伍账号" link to `/admin/teams`.

- [ ] **Step 4: Manual verification**

Defer the login-as-team part to after Task 23. For now confirm `/admin/teams` lists appointed teams and the reset-password dialog shows a new password.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/teams src/components/admin/TeamsManager.tsx src/components/layout/AdminNav.tsx
git commit -m "feat(captains): admin teams page"
```

---

### Task 22: Auth rewrite — username login & team accounts

**Files:**
- Modify (full rewrite): `src/types/next-auth.d.ts`
- Modify (full rewrite): `src/lib/auth.ts`
- Modify: `src/components/auth/LoginForm.tsx`, `src/components/auth/ChangePasswordForm.tsx`, `src/app/api/auth/change-password/route.ts`

- [ ] **Step 1: Rewrite the session type**

Replace `src/types/next-auth.d.ts` with:

```typescript
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      mustChangePwd: boolean;
      teamId: string | null;
      seasonId: string | null;
    };
  }
  interface User {
    id: string;
    username: string;
    role: Role;
    mustChangePwd: boolean;
    teamId: string | null;
    seasonId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    mustChangePwd: boolean;
    teamId: string | null;
    seasonId: string | null;
  }
}
```

- [ ] **Step 2: Rewrite the NextAuth config**

Replace `src/lib/auth.ts` with:

```typescript
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'username',
      credentials: {
        username: { label: '账号', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
          include: { team: { include: { season: true } } },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        // Team accounts of an archived season cannot log in.
        if (user.role === 'CAPTAIN') {
          if (!user.team || user.team.season.status === 'ARCHIVED') return null;
        }

        return {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePwd: user.mustChangePwd,
          teamId: user.team?.id ?? null,
          seasonId: user.team?.seasonId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.mustChangePwd = user.mustChangePwd;
        token.teamId = user.teamId;
        token.seasonId = user.seasonId;
      }
      if (trigger === 'update' && session?.mustChangePwd === false) {
        token.mustChangePwd = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        username: token.username,
        role: token.role,
        mustChangePwd: token.mustChangePwd,
        teamId: token.teamId,
        seasonId: token.seasonId,
      };
      return session;
    },
  },
};

export const getSession = () => getServerSession(authOptions);
```

- [ ] **Step 3: Update login / change-password UI & route**

Read `src/components/auth/LoginForm.tsx`, `src/components/auth/ChangePasswordForm.tsx`, and `src/app/api/auth/change-password/route.ts`. Replace every `gameId` reference with `username` (field names, labels, `signIn('credentials', { username, password })`). In the change-password route, look the user up by `session.user.id` (the route already has the session) — remove any `gameId`-based lookup.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'auth|login|change-password|teamId' || echo "auth ok"`
Expected: `auth ok` — the Task 20 `teamId` error is now resolved.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/types/next-auth.d.ts src/components/auth src/app/api/auth/change-password
git commit -m "refactor(auth): username login, team accounts, season-aware sessions"
```

---

### Task 23: Middleware rewrite — public routes & role gates

**Files:**
- Modify (full rewrite): `src/middleware.ts`

- [ ] **Step 1: Rewrite middleware**

Replace `src/middleware.ts` with:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Reachable with no session at all.
const PUBLIC_PREFIXES = ['/login', '/access-denied', '/register', '/live'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/register') ||
    pathname.startsWith('/api/live') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req });
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token.mustChangePwd && pathname !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }

  if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (pathname.startsWith('/captain') && (token.role !== 'CAPTAIN' || !token.teamId)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (pathname === '/') {
    if (token.role === 'ADMIN') return NextResponse.redirect(new URL('/admin', req.url));
    if (token.role === 'CAPTAIN' && token.teamId) {
      return NextResponse.redirect(new URL('/captain', req.url));
    }
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Manual verification**

`npm run dev`. Verify: `/register` and `/live` load logged-out; `/admin/*` redirects non-admins; appoint a captain in `/admin/registrations`, then log in with the team `username`/`password` and confirm you reach `/captain`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "refactor(auth): public /register and /live routes, team-account gating"
```

---

### Task 24: Add the `requireCaptain` guard

**Files:**
- Modify: `src/lib/api-guards.ts`

- [ ] **Step 1: Append the guard**

Read `src/lib/api-guards.ts`; keep `requireAdmin`. Append:

```typescript
export async function requireCaptain() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }
  if (session.user.role !== 'CAPTAIN' || !session.user.teamId) {
    return { error: NextResponse.json({ error: '需要队长账号' }, { status: 403 }) };
  }
  return { session };
}
```

`NextResponse` and `getSession` are already imported for `requireAdmin`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'api-guards' || echo "guards ok"`
Expected: `guards ok`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-guards.ts
git commit -m "feat(auth): add requireCaptain guard"
```

---

## Phase 4 — Draft Engine Retarget & Routes

### Task 25: Retarget the draft engine to Registration

The engine logic does not change — only the entity it reads, plus season scoping. Read `src/lib/draft/engine.ts` fully before editing.

**Files:**
- Modify: `src/lib/draft/engine.ts`
- Modify: `src/lib/draft/types.ts`

- [ ] **Step 1: Apply the retarget changes in `engine.ts`**

Apply every change below:

1. **`DraftStateError` code union** — add `'WRONG_SEASON_STATE'`.

2. **`startDraft`** — change signature `startDraft(actorUserId: string)` → `startDraft(seasonId: string, actorUserId: string)`. At the start of its transaction: load the season; if `season.status !== 'ROSTER_LOCKED'` throw `new DraftStateError('WRONG_SEASON_STATE', '赛季未处于名册锁定阶段')`. Create the `DraftSession` with `seasonId`. **Do not create teams** — teams already exist (created at captain appointment). Instead: load `tx.team.findMany({ where: { seasonId }, include: { captain: true } })`; for each team set `budgetLeft = season.teamBudget - team.captain.cost`, create one `TeamSlot` per `Position` value, and set the slot matching the first of `team.captain.primaryPositions` (enum order) to `registrationId = team.captainId`. Then `tx.season.update({ where: { id: seasonId }, data: { status: 'DRAFTING' } })`. Remove all `Config` reads/writes (`draftLocked`).

3. **Captain query** — replace `tx.player.findMany({ where: { isCaptain: true, isRetired: false } })` with `tx.registration.findMany({ where: { seasonId, isCaptain: true, status: 'ACTIVE' } })`.

4. **`registrationRefSelect`** — rename `playerRefSelect` to `registrationRefSelect`; select `{ id: true, nickname: true, primaryPositions: true, secondaryPositions: true, cost: true, player: { select: { gameId: true } } }`. Where the snapshot exposes a flat `gameId`, read it from `.player.gameId`.

5. **`getDraftSnapshot`** — change signature to `getDraftSnapshot(seasonId: string)`; scope the session lookup `where: { seasonId }`. Slots/picks include `registration: { select: registrationRefSelect }`.

6. **`resetDraft`** — change signature to `resetDraft(seasonId: string)`. Scope all deletes to that season's draft session; after wiping draft/round/pick/event rows, delete the season's `TeamSlot` rows and reset each `Team.budgetLeft` to 0, then `tx.season.update({ where: { id: seasonId }, data: { status: 'ROSTER_LOCKED' } })`. Remove `Config` unlock.

7. **`submitPick`** — rename input field `playerId` → `registrationId`. Pick eligibility: `player.isCaptain` → look up the `Registration` by `registrationId`; reject if `registration.isCaptain` (`PLAYER_IS_CAPTAIN`) or `registration.status === 'EXCLUDED'`. The "already picked" check queries `DraftPick` by `registrationId`. `DraftPick.create` writes `registrationId`. `TeamSlot` update writes `{ registrationId }`.

8. **`revokePick`, `rewindRound`, `rearrangeSlots`** — every `TeamSlot.playerId` and `DraftPick.playerId` reference becomes `registrationId`; logic otherwise unchanged. `rearrangeSlots`'s "player set is a permutation" check now compares `registrationId` sets.

9. **`onTheClock`** — still stores a captain id; that captain id is now a `Registration` id (`Team.captainId`). No code change beyond the rename, but verify comparisons still hold.

- [ ] **Step 2: Update `types.ts`**

In `src/lib/draft/types.ts`: rename snapshot fields `playerId` → `registrationId`; the embedded ref type carries `{ id, nickname, gameId, primaryPositions, secondaryPositions, cost }` (the engine flattens `gameId` from `player.gameId`). Update `DraftTeamSlotSnapshot` and `DraftPickSnapshot` accordingly.

- [ ] **Step 3: Typecheck the engine**

Run: `npm run typecheck 2>&1 | grep -E 'lib/draft/(engine|types|orderResolvers)' || echo "engine ok"`
Expected: `engine ok`. Consumers (routes/components) still error — fixed in Tasks 26–32.

- [ ] **Step 4: Commit**

```bash
git add src/lib/draft/engine.ts src/lib/draft/types.ts
git commit -m "refactor(draft): retarget engine to Registration, make season-scoped"
```

---

### Task 26: Retarget draft API routes

**Files:**
- Modify: `src/app/api/draft/start/route.ts`, `reset/route.ts`, `state/route.ts`, `pick/route.ts`, `pick/[id]/revoke/route.ts`, `round/start/route.ts`, `round/rewind/route.ts`, `team/[id]/slots/route.ts`, `export/route.ts`

- [ ] **Step 1: Season-scope every draft route**

Read each route file. After the auth guard, add:

```typescript
import { getActiveSeason } from '@/lib/season/season-service';
// ...
const season = await getActiveSeason(prisma);
if (!season) return NextResponse.json({ error: '没有活跃赛季' }, { status: 409 });
```

Pass `season.id` to the engine call: `startDraft(season.id, session.user.id)`, `getDraftSnapshot(season.id)`, `resetDraft(season.id)`, etc. The `start` route additionally maps a `DraftStateError` with code `WRONG_SEASON_STATE` to a 422 response.

- [ ] **Step 2: Fix the pick route's captain resolution**

In `src/app/api/draft/pick/route.ts`: rename the body field `playerId` → `registrationId`. Replace the captain-identity block with:

```typescript
let byCaptainId: string;
if (parsed.data.onBehalfOf) {
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '仅管理员可代选' }, { status: 403 });
  }
  byCaptainId = parsed.data.onBehalfOf; // a Registration id (the team's captainId)
} else {
  if (session.user.role !== 'CAPTAIN' || !session.user.teamId) {
    return NextResponse.json({ error: '非队长账号无法出手' }, { status: 403 });
  }
  const team = await prisma.team.findUnique({
    where: { id: session.user.teamId },
    select: { captainId: true },
  });
  if (!team) return NextResponse.json({ error: '队伍不存在' }, { status: 404 });
  byCaptainId = team.captainId;
}
```

Pass `registrationId` to `submitPick`. Keep the `publish(...)` SSE call and `DraftStateError → 409` mapping.

- [ ] **Step 3: Typecheck the draft routes**

Run: `npm run typecheck 2>&1 | grep -E 'api/draft' || echo "draft routes ok"`
Expected: `draft routes ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/draft
git commit -m "refactor(draft): season-scope draft routes, registration-based picks"
```

---

### Task 27: Retarget the pure-function helpers

**Files:**
- Modify: `src/lib/filters.ts`, `src/lib/filters.test.ts`
- Modify: `src/lib/teams/preview.ts`, `src/lib/teams/preview.test.ts`

- [ ] **Step 1: Update `filters.ts`**

`filterPlayers`/`sortPlayers` operate on a `PlayerForPool` type. Rename it to `RegistrationForPool` with fields `{ id: string; gameId: string; nickname: string; primaryPositions: Position[]; secondaryPositions: Position[]; cost: number }` (flat `gameId` — the engine flattens it). The search/sort logic stays the same (it already reads `gameId`, `nickname`, `cost`, positions). Remove any `isCaptain`/`isRetired` references.

- [ ] **Step 2: Update `filters.test.ts`**

Update the `p()` fixture factory and the test player array to the new flat shape (no `isCaptain`/`isRetired`). Keep every existing test case and assertion.

Run: `npm run test -- src/lib/filters.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `preview.ts` and its test**

`computeTeamPreviews` takes captain refs. Update the captain ref type to `{ id: string; gameId: string; nickname: string; cost: number; primaryPositions: Position[] }`. `pickCaptainSlot` already takes `{ primaryPositions }` — unchanged. Update `preview.test.ts` fixtures to the new shape; keep all cases.

Run: `npm run test -- src/lib/teams/preview.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts src/lib/teams/preview.ts src/lib/teams/preview.test.ts
git commit -m "refactor(draft): retarget pure helpers to registration shape"
```

---

### Task 28: Public live state & SSE routes

**Files:**
- Create: `src/app/api/live/[seasonId]/state/route.ts`
- Create: `src/app/api/live/[seasonId]/stream/route.ts`

- [ ] **Step 1: Public state route**

Create `src/app/api/live/[seasonId]/state/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getDraftSnapshot } from '@/lib/draft/engine';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { seasonId: string } }) {
  try {
    const snapshot = await getDraftSnapshot(params.seasonId);
    return NextResponse.json({ snapshot });
  } catch (e) {
    console.error('GET /api/live state failed', e);
    return NextResponse.json({ error: '无法读取选秀状态' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Public stream route**

Create `src/app/api/live/[seasonId]/stream/route.ts` — copy the structure of `src/app/api/draft/stream/route.ts` verbatim with two changes: (a) remove the `getSession` import and the auth check (this route is public); (b) the `hello` event payload is `{ ts: Date.now() }`. Keep `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, the `ReadableStream`, `subscribe`/heartbeat/cleanup, and the SSE headers.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'api/live' || echo "live routes ok"`
Expected: `live routes ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/live
git commit -m "feat(live): public read-only draft state + SSE routes"
```

---

## Phase 5 — Draft UI & Public Spectator Page

### Task 29: Retarget the draft hook & shared draft components

**Files:**
- Modify: `src/hooks/useDraftStream.ts`
- Modify: `src/components/draft/PlayerPool.tsx`, `TeamPanel.tsx`, `PlayerInfoCard.tsx`, `PlayerHoverCard.tsx`, `CaptainDashboard.tsx`
- Modify: `src/app/captain/page.tsx`
- Modify: `src/components/captain/*` as needed for renamed fields

- [ ] **Step 1: Parameterize the draft hook**

Read `src/hooks/useDraftStream.ts`. Add an options argument: `useDraftStream(initialSnapshot, opts?: { stateUrl?: string; streamUrl?: string })`, defaulting `stateUrl` to `/api/draft/state` and `streamUrl` to `/api/draft/stream` (the current literals). Keep the existing reconnect/backoff logic.

- [ ] **Step 2: Retarget shared components to the new snapshot shape**

In `PlayerPool`, `TeamPanel`, `PlayerInfoCard`, `PlayerHoverCard`, `CaptainDashboard` and the `src/components/captain/*` components: rename every snapshot field `playerId` → `registrationId`; player refs read `nickname`/`gameId`/`cost`/`primaryPositions`/`secondaryPositions` from the registration-shaped ref defined in Task 25 Step 2. The captain page layout is **not** redesigned — only field renames so it compiles and runs.

- [ ] **Step 3: Fix the captain page data fetch**

Rewrite `src/app/captain/page.tsx`:

```typescript
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { computeTeamPreviews } from '@/lib/teams/preview';
import { CaptainDashboard } from '@/components/draft/CaptainDashboard';

export const dynamic = 'force-dynamic';

export default async function CaptainPage() {
  const session = await getSession();
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">暂无进行中的赛季</div>;

  const ownTeam = session?.user.teamId
    ? await prisma.team.findUnique({
        where: { id: session.user.teamId },
        select: { captainId: true },
      })
    : null;

  const [pool, captains, snapshot] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: true, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    getDraftSnapshot(season.id),
  ]);

  const flat = (r: (typeof pool)[number]) => ({
    id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
    primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
  });

  return (
    <CaptainDashboard
      initialSnapshot={snapshot}
      pool={pool.map(flat)}
      virtualTeams={computeTeamPreviews(captains.map(flat), season.teamBudget)}
      ownCaptainId={ownTeam?.captainId ?? null}
      teamBudget={season.teamBudget}
    />
  );
}
```

Update `CaptainDashboard`'s prop types to match (`pool`/`virtualTeams` element shapes per `flat`, `ownCaptainId: string | null`; drop the old `ownGameId` prop and any use of it).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'captain|useDraftStream|components/draft' || echo "captain side ok"`
Expected: `captain side ok`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDraftStream.ts src/components/draft src/components/captain src/app/captain
git commit -m "refactor(draft): retarget shared draft UI + captain page to registrations"
```

---

### Task 30: Broadcast layout components

The approved B-hybrid layout (left player pool · center hero + team grid · right event stream) is shared by the admin draft page and `/live`.

**Files:**
- Create: `src/components/draft/OnTheClockHero.tsx`
- Create: `src/components/draft/TeamCard.tsx`
- Create: `src/components/draft/TeamGrid.tsx`
- Create: `src/components/draft/EventStream.tsx`
- Create: `src/components/draft/BroadcastLayout.tsx`

- [ ] **Step 1: `OnTheClockHero`**

Create `src/components/draft/OnTheClockHero.tsx` — presentational. Props: `{ teamName: string | null; round: number; budgetLeft: number | null; missingPositions: string[]; pickedCount: number; slotCount: number }`. Renders a prominent banner: a round label, the on-the-clock `teamName` large, and pill chips for `预算 {budgetLeft}`, `待补 {missingPositions}`, `已选 {pickedCount}/{slotCount}`. When `teamName` is null render a muted "选秀未进行" state. Tailwind only.

- [ ] **Step 2: `TeamCard`**

Create `src/components/draft/TeamCard.tsx`. Props: `{ team: DraftTeamSnapshot; live: boolean }` (`DraftTeamSnapshot` from `@/lib/draft/types`). Renders the compact card: team name, 5 position dots (filled when the matching slot has a `registration`), a budget bar (`budgetLeft` vs a max). `live` adds a highlighted ring. Keep it a pure presentational component receiving the whole `team` snapshot so a future hover-detail popover can wrap it without changes.

- [ ] **Step 3: `TeamGrid`**

Create `src/components/draft/TeamGrid.tsx`. Props: `{ teams: DraftTeamSnapshot[]; onTheClockId: string | null }`. Renders a CSS grid `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2` of `TeamCard`s — responsive 4×N so 12–16 teams fit one screen. A team is `live` when its `captainId === onTheClockId`.

- [ ] **Step 4: `EventStream`**

Create `src/components/draft/EventStream.tsx`. Props: `{ events: { id: string; label: string }[] }`. Renders a vertical list, newest first, the first item accented. Pure presentational.

- [ ] **Step 5: `BroadcastLayout`**

Create `src/components/draft/BroadcastLayout.tsx`. Props: `{ pool: ReactNode; hero: ReactNode; grid: ReactNode; events: ReactNode; controls?: ReactNode }`. Desktop (`lg:` and up): a flex row — left `pool` (`lg:w-1/5`), center column (`controls` if present, then `hero`, then `grid`, flex-1), right `events` (`lg:w-1/5`). Mobile (below `lg`): `controls` (if any) then a pinned `hero`, then a shadcn `Tabs` with three tabs — "选手"=`pool`, "队伍"=`grid`, "事件"=`events`. Pure layout, no data.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E 'OnTheClockHero|TeamGrid|TeamCard|EventStream|BroadcastLayout' || echo "layout components ok"`
Expected: `layout components ok`.

- [ ] **Step 7: Commit**

```bash
git add src/components/draft/OnTheClockHero.tsx src/components/draft/TeamCard.tsx src/components/draft/TeamGrid.tsx src/components/draft/EventStream.tsx src/components/draft/BroadcastLayout.tsx
git commit -m "feat(draft): reusable B-hybrid broadcast layout components"
```

---

### Task 31: Re-lay-out the admin draft page

**Files:**
- Modify: `src/app/admin/draft/page.tsx`
- Modify: `src/components/admin/DraftControl.tsx`

- [ ] **Step 1: Update the server page**

Replace `src/app/admin/draft/page.tsx` with:

```typescript
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl';

export const dynamic = 'force-dynamic';

export default async function DraftConsolePage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;

  const [snapshot, captainCount, pool] = await Promise.all([
    getDraftSnapshot(season.id),
    prisma.registration.count({
      where: { seasonId: season.id, isCaptain: true, status: 'ACTIVE' },
    }),
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
  ]);

  return (
    <DraftControl
      season={season}
      initialSnapshot={snapshot}
      activeCaptainCount={captainCount}
      teamBudget={season.teamBudget}
      pool={pool.map((r) => ({
        id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
        primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
      }))}
    />
  );
}
```

- [ ] **Step 2: Re-lay-out `DraftControl`**

Update `src/components/admin/DraftControl.tsx`:

- Add a `season: Season` prop. Update the `pool` prop element type to the flat registration shape from Step 1.
- Render the page through `BroadcastLayout`:
  - `controls`: the existing draft operation controls (start draft → `POST /api/draft/start`; open round + mode via the existing `RoundConfigDialog`; rewind round; reset). Keep all existing handlers and `useDraftStream(initialSnapshot)` — only move the controls markup into the `controls` slot.
  - `hero`: `OnTheClockHero` — derive `teamName` from the snapshot team whose `captainId === snapshot.session.onTheClock`, `round` from `snapshot.session.currentRound`, and budget/missing/picked from that team's slots.
  - `grid`: `TeamGrid` from `snapshot.teams` with `onTheClockId = snapshot.session?.onTheClock ?? null`.
  - `pool`: the existing `PlayerPool`.
  - `events`: `EventStream` — map the snapshot's non-revoked picks (most recent first) to `{ id, label }` where `label` is `「{teamName}」选中 {nickname} · {position} · {costPaid}`.

- [ ] **Step 3: Manual verification**

With a season in `ROSTER_LOCKED` and ≥2 captains appointed: start the draft at `/admin/draft`, run a round; confirm the three-column layout renders and live updates work.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/draft/page.tsx src/components/admin/DraftControl.tsx
git commit -m "feat(draft): re-lay-out admin draft page with B-hybrid layout"
```

---

### Task 32: Public spectator page

**Files:**
- Create: `src/app/live/layout.tsx`
- Create: `src/app/live/page.tsx`
- Create: `src/components/live/SeasonSelector.tsx`
- Create: `src/components/live/SpectatorView.tsx`

- [ ] **Step 1: Public layout**

Create `src/app/live/layout.tsx` — a standalone layout (no admin/captain nav): `<main className="mx-auto max-w-7xl p-4"><h1 className="mb-4 text-xl font-bold">选秀直播</h1>{children}</main>`.

- [ ] **Step 2: Server page**

Create `src/app/live/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { listSeasons } from '@/lib/season/season-service';
import { SpectatorView } from '@/components/live/SpectatorView';

export const dynamic = 'force-dynamic';

export default async function LivePage({
  searchParams,
}: {
  searchParams: { season?: string };
}) {
  const seasons = await listSeasons(prisma);
  const draftable = seasons.filter((s) =>
    ['DRAFTING', 'COMPLETED', 'ARCHIVED'].includes(s.status),
  );
  const selected =
    draftable.find((s) => s.id === searchParams.season) ?? draftable[0] ?? null;

  if (!selected) {
    return <div className="text-center text-muted-foreground">选秀尚未开始</div>;
  }

  const snapshot = await getDraftSnapshot(selected.id);
  return (
    <SpectatorView seasons={draftable} selectedSeason={selected} initialSnapshot={snapshot} />
  );
}
```

- [ ] **Step 3: `SeasonSelector`**

Create `src/components/live/SeasonSelector.tsx` — a `'use client'` component using shadcn `Select`. Props `{ seasons: Season[]; selectedId: string }`; on change, `useRouter().push('/live?season=' + id)`.

- [ ] **Step 4: `SpectatorView`**

Create `src/components/live/SpectatorView.tsx`. A `'use client'` component:

- Props: `{ seasons: Season[]; selectedSeason: Season; initialSnapshot: DraftSnapshot }`.
- If `selectedSeason.status === 'DRAFTING'`: `useDraftStream(initialSnapshot, { stateUrl: \`/api/live/${selectedSeason.id}/state\`, streamUrl: \`/api/live/${selectedSeason.id}/stream\` })`. Otherwise use `initialSnapshot` directly with no stream subscription.
- Render `SeasonSelector` in a header row, then `BroadcastLayout` (no `controls` slot) with `hero` = `OnTheClockHero`, `grid` = `TeamGrid`, `events` = `EventStream` (same derivations as Task 31 Step 2), and `pool` = the existing `PlayerPool` in its display-only form (pass through whatever read-only props it accepts; do not wire pick actions).

- [ ] **Step 5: Manual verification**

With a draft in progress, open `/live` logged-out in two browser windows; make a pick from the admin/captain side; confirm both `/live` views update live. Switch the season selector to a `COMPLETED`/`ARCHIVED` season and confirm it renders that draft's final state statically.

- [ ] **Step 6: Commit**

```bash
git add src/app/live src/components/live
git commit -m "feat(live): public spectator page with season selector"
```

---

### Task 33: Remove superseded roster code & full verification

**Files:**
- Delete: superseded `/admin/players*` pages, `/api/players*` routes, and player-only components with no remaining caller.
- Modify: `src/components/layout/AdminNav.tsx`

- [ ] **Step 1: Remove superseded player roster code**

The pre-refactor roster management (`src/app/admin/players/`, `src/app/admin/players/import/`, `src/app/api/players/`, `src/components/players/PlayerManager.tsx`, `PlayerFormDialog.tsx`, `ImportUpload.tsx`) is replaced by `/admin/registrations`. Run `grep -rl "api/players\|PlayerManager" src/` to find references; delete those files and remove the `/admin/players` links from `AdminNav.tsx`. Keep `src/components/players/positions.ts` if anything still imports it; otherwise delete it. Leave `src/lib/import/` in place but unreferenced (re-adding a bulk-import UI is a future task per spec §5.4) — if its files fail typecheck due to the schema change, either delete `src/lib/import/` entirely or fix the field references; deleting is acceptable since nothing calls it.

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: PASS, zero errors. Fix any stragglers (leftover `gameId`/`Config`/`Player`/`isRetired` references) inline.

- [ ] **Step 3: Full test run**

Run: `npm run test`
Expected: PASS — all schema/season/registration/captain/team service tests plus the retargeted `filters`/`orderResolvers`/`preview` pure tests.

- [ ] **Step 4: Full manual smoke test**

`npm run dev`. Walk the whole lifecycle: create season → 开启报名 → submit 2+ registrations at `/register` (logged out) → 截止报名 → at `/admin/registrations` set costs and appoint 2 captains (capture credentials) → `/admin/teams` lists accounts → log in as a team account, reach `/captain` → as admin start the draft at `/admin/draft` → run a round → watch `/live` update live → finish the draft → create a new season and confirm the prior one archives.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove superseded roster code, finalize multi-season refactor"
```

---

## Self-Review Notes

- **Spec coverage:** §3 schema → Tasks 1–2; §3.3 module layout → Tasks 5–32; §4 season lifecycle → Tasks 5–9 (REGISTRATION/ROSTER_LOCKED) + Task 25 (DRAFTING/COMPLETED via the engine) + Task 6 (single-active-season archive); §5 registration → Tasks 10–16; §6 captains/auth → Tasks 17–24; §7 draft engine + UI → Tasks 25–32; §8 error handling → 400/403/404/409/422 mapping in each route task; §9 testing → service tests Tasks 5–19 + harness Task 4; §10 migration → Tasks 2–3.
- **Deliberate cross-task errors (called out in-task):** Task 20 leaves one `session.user.teamId` typecheck error resolved by Task 22; `/register` and `/live` are reachable logged-out only after the Task 23 middleware rewrite (Tasks 15/32 manual-verify steps note this).
- **Type consistency:** the registration ref shape `{ id, gameId, nickname, cost, primaryPositions, secondaryPositions }` is defined in Task 25 Step 2 and reused verbatim in Tasks 27, 29, 31. `RegistrationWithPlayer` (Task 12) and `TeamWithRefs` (Task 19) are the canonical include-payload types reused by their routes/pages. `AppointResult` (Task 18) is the appoint-captain response shape used by Task 20 and Task 16's credential dialog.
- **Test realism:** service tests require `TEST_DATABASE_URL` + a `lol_system_test` Postgres database (Task 4). Route handlers and UI use typecheck + scripted manual verification, consistent with the codebase having no route/component test infrastructure.
- **Out of scope (spec §11):** tournament phase, hover detail popovers, Redis SSE, CAPTCHA, bulk CSV import UI — no tasks. `TeamCard` (Task 30) is deliberately built as a pure presentational component so the future hover popover can wrap it without restructuring.
```
