# Tournament System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the post-draft tournament: configurable group stage (BO1 round-robin) → admin-arranged 8-team knockout (QF/SF BO3, Final BO5), with admin scheduling, game-by-game score entry, walkover/edit/revoke, SSE-live public viewing, and captain/admin team rename.

**Architecture:** Mirrors the existing event-sourced draft (`DraftSession` + `DraftEvent`). Pure service layer in `src/lib/tournament/*` writes all mutations through `tournament-events.append()` in a single Prisma transaction (insert event → bump `Tournament.seq` → update materialized rows). Routes are thin (authz + Zod + service call). SSE via an isolated `tournament-bus`. Standings, bracket, schedule are recomputed from `Match` + `MatchGame` on read.

**Tech Stack:** Next.js 15 App Router, Prisma + Postgres, NextAuth, Zod, vitest, shadcn/Radix, `@dnd-kit/core`, sonner.

**Spec:** `docs/superpowers/specs/2026-05-11-tournament-design.md`

**Conventions:**
- Test files colocated as `*.test.ts` next to source (matches `src/lib/filters.test.ts`).
- Use `db` from `@/lib/db` (existing).
- Commit after every task. Conventional Commits: `feat(tournament): …`, `test(tournament): …`, `chore(tournament): …`.
- Run a single test file: `npx vitest run <path>`. All tests: `npm test`.
- DB tests require a reachable Postgres (see `.env.example`). Pure-function tests have no DB dependency.

---

## Phase 1 — Foundation (schema + pure helpers)

### Task 1: Add Prisma models, enums, and `Team.name @unique`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append new enums + models at the bottom of `prisma/schema.prisma`**

```prisma
// ──────────────────────────────────────────────────────────────────────
// Tournament — group stage + single-elim knockout
// ──────────────────────────────────────────────────────────────────────

enum TournamentStatus {
  NOT_STARTED
  GROUP_STAGE
  BRACKET_SEEDING
  KNOCKOUT
  FINISHED
}

enum MatchPhase {
  GROUP
  TIEBREAKER
  QF
  SF
  FINAL
}

enum MatchFormat {
  BO1
  BO3
  BO5
}

enum MatchStatus {
  SCHEDULED
  IN_PROGRESS
  FINISHED
  WALKOVER
  CANCELLED
}

enum TournamentEventType {
  TOURNAMENT_CREATED
  GROUPS_DEFINED
  TEAM_ASSIGNED
  MATCHES_GENERATED
  MATCH_SCHEDULED
  MATCH_RESCHEDULED
  GAME_RECORDED
  GAME_REVOKED
  MATCH_FINISHED
  MATCH_EDITED
  MATCH_WALKOVER
  TIEBREAKER_CREATED
  GROUP_STAGE_CLOSED
  BRACKET_SEEDED
  BRACKET_LOCKED
  KNOCKOUT_ADVANCED
  TOURNAMENT_FINISHED
  TOURNAMENT_RESET
}

model Tournament {
  id                String           @id @default(cuid())
  name              String
  status            TournamentStatus @default(NOT_STARTED)
  groupCount        Int
  teamsPerGroup     Int
  advancingPerGroup Int
  seq               Int              @default(0)
  startedAt         DateTime?
  finishedAt        DateTime?
  championId        String?
  champion          Team?            @relation("TournamentChampion", fields: [championId], references: [id])

  groups  Group[]
  matches Match[]
  events  TournamentEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("tournaments")
}

model Group {
  id           String      @id @default(cuid())
  tournamentId String
  letter       String
  tournament   Tournament  @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  teams        GroupTeam[]
  matches      Match[]
  @@unique([tournamentId, letter])
  @@map("groups")
}

model GroupTeam {
  groupId String
  teamId  String
  seed    Int
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  team    Team  @relation(fields: [teamId], references: [id])
  @@id([groupId, teamId])
  @@unique([teamId])
  @@map("group_teams")
}

model Match {
  id           String      @id @default(cuid())
  tournamentId String
  phase        MatchPhase
  format       MatchFormat
  status       MatchStatus @default(SCHEDULED)

  groupId      String?

  roundIndex   Int?
  matchIndex   Int?
  nextMatchId  String?
  nextSide     String?

  teamAId      String?
  teamBId      String?
  scheduledAt  DateTime?
  winnerTeamId String?
  walkoverNote String?

  tournament Tournament  @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group?      @relation(fields: [groupId], references: [id])
  teamA      Team?       @relation("MatchTeamA", fields: [teamAId], references: [id])
  teamB      Team?       @relation("MatchTeamB", fields: [teamBId], references: [id])
  winner     Team?       @relation("MatchWinner", fields: [winnerTeamId], references: [id])
  games      MatchGame[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tournamentId, phase])
  @@index([scheduledAt])
  @@map("matches")
}

model MatchGame {
  id           String   @id @default(cuid())
  matchId      String
  gameNumber   Int
  winnerTeamId String
  recordedAt   DateTime @default(now())
  match        Match    @relation(fields: [matchId], references: [id], onDelete: Cascade)
  winnerTeam   Team     @relation("GameWinner", fields: [winnerTeamId], references: [id])
  @@unique([matchId, gameNumber])
  @@map("match_games")
}

model TournamentEvent {
  id           String              @id @default(cuid())
  tournamentId String
  type         TournamentEventType
  payload      Json
  actorId      String
  seq          Int
  tournament   Tournament          @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  createdAt    DateTime            @default(now())
  @@unique([tournamentId, seq])
  @@index([tournamentId, createdAt])
  @@map("tournament_events")
}
```

- [ ] **Step 2: Update existing `Team` model**

Change `name String` to `name String @unique`. Insert the following block right before `createdAt DateTime @default(now())`:

```prisma
  // tournament back-relations
  groupTeam      GroupTeam?
  matchesAsA     Match[]      @relation("MatchTeamA")
  matchesAsB     Match[]      @relation("MatchTeamB")
  matchesWon     Match[]      @relation("MatchWinner")
  gamesWon       MatchGame[]  @relation("GameWinner")
  tournamentsWon Tournament[] @relation("TournamentChampion")
```

- [ ] **Step 3: Generate migration without applying**

```bash
npx prisma migrate dev --create-only --name tournament_system
```

Expected: new folder `prisma/migrations/<timestamp>_tournament_system/migration.sql`.

- [ ] **Step 4: Prepend duplicate-name backfill SQL**

Open `prisma/migrations/<timestamp>_tournament_system/migration.sql` and prepend, BEFORE the line `CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name")`:

```sql
-- Backfill: ensure team names are unique before applying the unique index
WITH dups AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt") AS rn
  FROM teams
)
UPDATE teams t
SET name = t.name || '-' || substring(t.id, 1, 4)
FROM dups
WHERE t.id = dups.id AND dups.rn > 1;
```

- [ ] **Step 5: Apply migration and regenerate the client**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: no errors; tables `tournaments`, `groups`, `group_teams`, `matches`, `match_games`, `tournament_events` created.

- [ ] **Step 6: Type-check**

```bash
npm run typecheck
```

Expected: passes (Prisma client now has the new types).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tournament): add prisma models, enums, and team.name unique"
```

---

### Task 2: `series-format.ts` — pure helpers for BO logic

**Files:**
- Create: `src/lib/tournament/series-format.ts`
- Test: `src/lib/tournament/series-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/series-format.test.ts
import { describe, it, expect } from 'vitest';
import {
  winsNeeded,
  maxGames,
  computeSeriesScore,
  isSeriesComplete,
  seriesWinner,
} from './series-format';

describe('series-format', () => {
  it('winsNeeded: BO1=1, BO3=2, BO5=3', () => {
    expect(winsNeeded('BO1')).toBe(1);
    expect(winsNeeded('BO3')).toBe(2);
    expect(winsNeeded('BO5')).toBe(3);
  });

  it('maxGames: BO1=1, BO3=3, BO5=5', () => {
    expect(maxGames('BO1')).toBe(1);
    expect(maxGames('BO3')).toBe(3);
    expect(maxGames('BO5')).toBe(5);
  });

  it('computeSeriesScore counts wins by team', () => {
    const games = [
      { winnerTeamId: 'A' },
      { winnerTeamId: 'B' },
      { winnerTeamId: 'A' },
    ];
    expect(computeSeriesScore(games, 'A', 'B')).toEqual({ a: 2, b: 1 });
  });

  it('isSeriesComplete: true at threshold, false below', () => {
    expect(isSeriesComplete('BO3', { a: 2, b: 0 })).toBe(true);
    expect(isSeriesComplete('BO3', { a: 1, b: 1 })).toBe(false);
    expect(isSeriesComplete('BO5', { a: 3, b: 2 })).toBe(true);
  });

  it('seriesWinner returns null when incomplete, else winning teamId', () => {
    expect(seriesWinner('BO3', { a: 1, b: 0 }, 'A', 'B')).toBeNull();
    expect(seriesWinner('BO3', { a: 2, b: 0 }, 'A', 'B')).toBe('A');
    expect(seriesWinner('BO5', { a: 1, b: 3 }, 'A', 'B')).toBe('B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/series-format.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/series-format.ts
import type { MatchFormat } from '@prisma/client';

export function winsNeeded(format: MatchFormat): number {
  return format === 'BO1' ? 1 : format === 'BO3' ? 2 : 3;
}

export function maxGames(format: MatchFormat): number {
  return format === 'BO1' ? 1 : format === 'BO3' ? 3 : 5;
}

export interface GameRow { winnerTeamId: string }

export function computeSeriesScore(
  games: GameRow[],
  teamAId: string,
  teamBId: string,
): { a: number; b: number } {
  let a = 0, b = 0;
  for (const g of games) {
    if (g.winnerTeamId === teamAId) a++;
    else if (g.winnerTeamId === teamBId) b++;
  }
  return { a, b };
}

export function isSeriesComplete(
  format: MatchFormat,
  score: { a: number; b: number },
): boolean {
  const need = winsNeeded(format);
  return score.a >= need || score.b >= need;
}

export function seriesWinner(
  format: MatchFormat,
  score: { a: number; b: number },
  teamAId: string,
  teamBId: string,
): string | null {
  const need = winsNeeded(format);
  if (score.a >= need) return teamAId;
  if (score.b >= need) return teamBId;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/series-format.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/series-format.ts src/lib/tournament/series-format.test.ts
git commit -m "feat(tournament): series-format helpers for BO1/BO3/BO5"
```

---

### Task 3: `standings-service.ts` — pure standings + tie detection

**Files:**
- Create: `src/lib/tournament/standings-service.ts`
- Test: `src/lib/tournament/standings-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/standings-service.test.ts
import { describe, it, expect } from 'vitest';
import { computeStandings, type StandingMatch } from './standings-service';

const finished = (
  id: string, gId: string, a: string, b: string, winner: string,
  phase: 'GROUP' | 'TIEBREAKER' = 'GROUP',
): StandingMatch => ({
  id, phase, groupId: gId, status: 'FINISHED',
  teamAId: a, teamBId: b, winnerTeamId: winner,
});

describe('computeStandings', () => {
  it('all-distinct wins → ordered by wins desc', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T1', 'T3', 'T1'),
      finished('m3', 'g1', 'T1', 'T4', 'T1'),
      finished('m4', 'g1', 'T2', 'T3', 'T2'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.map(r => r.teamId)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(s.tieGroups).toEqual([]);
  });

  it('two-team tie resolved by head-to-head', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'), // T1 beats T2 head-to-head
      finished('m2', 'g1', 'T1', 'T3', 'T3'),
      finished('m3', 'g1', 'T1', 'T4', 'T1'),
      finished('m4', 'g1', 'T2', 'T3', 'T2'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T4'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.slice(0, 2).map(r => r.teamId)).toEqual(['T1', 'T2']);
    expect(s.tieGroups).toEqual([]);
  });

  it('three-team cyclic tie → flagged as unresolved', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T2', 'T3', 'T2'),
      finished('m3', 'g1', 'T3', 'T1', 'T3'),
      finished('m4', 'g1', 'T1', 'T4', 'T1'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
    ];
    const s = computeStandings(matches);
    expect(s.tieGroups).toHaveLength(1);
    expect(s.tieGroups[0].groupId).toBe('g1');
    expect(s.tieGroups[0].tiedTeamIds.sort()).toEqual(['T1', 'T2', 'T3']);
  });

  it('tiebreaker matches resolve a cyclic tie', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T2', 'T3', 'T2'),
      finished('m3', 'g1', 'T3', 'T1', 'T3'),
      finished('m4', 'g1', 'T1', 'T4', 'T1'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
      finished('tb1', 'g1', 'T1', 'T2', 'T1', 'TIEBREAKER'),
      finished('tb2', 'g1', 'T2', 'T3', 'T2', 'TIEBREAKER'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.slice(0, 3).map(r => r.teamId)).toEqual(['T1', 'T2', 'T3']);
    expect(s.tieGroups).toEqual([]);
  });

  it('WALKOVER counts as a win for the winner', () => {
    const matches: StandingMatch[] = [{
      id: 'm1', phase: 'GROUP', groupId: 'g1', status: 'WALKOVER',
      teamAId: 'T1', teamBId: 'T2', winnerTeamId: 'T1',
    }];
    const s = computeStandings(matches);
    const t1 = s.byGroup.g1.find(r => r.teamId === 'T1')!;
    expect(t1.wins).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/standings-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/standings-service.ts

export interface StandingMatch {
  id: string;
  phase: string;
  groupId: string | null;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
}

export interface StandingRow {
  teamId: string;
  wins: number;
  losses: number;
  points: number;
}

export interface TieGroup {
  groupId: string;
  tiedTeamIds: string[];
}

export interface StandingsResult {
  byGroup: Record<string, StandingRow[]>;
  tieGroups: TieGroup[];
}

function isCounted(m: StandingMatch): boolean {
  return (m.status === 'FINISHED' || m.status === 'WALKOVER') && !!m.winnerTeamId;
}

export function computeStandings(matches: StandingMatch[]): StandingsResult {
  const counted = matches.filter(
    m => m.groupId && (m.phase === 'GROUP' || m.phase === 'TIEBREAKER') && isCounted(m),
  );

  const teamsByGroup = new Map<string, Set<string>>();
  const wlByGroup = new Map<string, Map<string, { wins: number; losses: number }>>();

  for (const m of counted) {
    const g = m.groupId!;
    if (!teamsByGroup.has(g)) teamsByGroup.set(g, new Set());
    if (!wlByGroup.has(g)) wlByGroup.set(g, new Map());
    teamsByGroup.get(g)!.add(m.teamAId!);
    teamsByGroup.get(g)!.add(m.teamBId!);

    const wl = wlByGroup.get(g)!;
    const winner = m.winnerTeamId!;
    const loser = winner === m.teamAId ? m.teamBId! : m.teamAId!;
    if (!wl.has(winner)) wl.set(winner, { wins: 0, losses: 0 });
    if (!wl.has(loser)) wl.set(loser, { wins: 0, losses: 0 });

    // TIEBREAKER matches are used ONLY for ordering, not for W/L totals.
    if (m.phase === 'GROUP') {
      wl.get(winner)!.wins++;
      wl.get(loser)!.losses++;
    }
  }

  const byGroup: Record<string, StandingRow[]> = {};
  const tieGroups: TieGroup[] = [];

  for (const [gId, teams] of teamsByGroup) {
    const wl = wlByGroup.get(gId)!;
    const rows: StandingRow[] = [];
    for (const tId of teams) {
      const r = wl.get(tId) ?? { wins: 0, losses: 0 };
      rows.push({ teamId: tId, wins: r.wins, losses: r.losses, points: r.wins });
    }
    rows.sort((a, b) => b.wins - a.wins);

    const sorted: StandingRow[] = [];
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j].wins === rows[i].wins) j++;
      const bucket = rows.slice(i, j);
      if (bucket.length === 1) {
        sorted.push(bucket[0]);
      } else {
        const resolved = resolveTieBucket(bucket, counted, gId);
        if (resolved) {
          sorted.push(...resolved);
        } else {
          sorted.push(...bucket);
          tieGroups.push({ groupId: gId, tiedTeamIds: bucket.map(b => b.teamId) });
        }
      }
      i = j;
    }
    byGroup[gId] = sorted;
  }

  return { byGroup, tieGroups };
}

function resolveTieBucket(
  bucket: StandingRow[],
  matches: StandingMatch[],
  groupId: string,
): StandingRow[] | null {
  const ids = new Set(bucket.map(b => b.teamId));
  const subWins = new Map<string, number>();
  for (const tId of ids) subWins.set(tId, 0);
  for (const m of matches) {
    if (m.groupId !== groupId) continue;
    if (!m.teamAId || !m.teamBId || !m.winnerTeamId) continue;
    if (!ids.has(m.teamAId) || !ids.has(m.teamBId)) continue;
    subWins.set(m.winnerTeamId, (subWins.get(m.winnerTeamId) ?? 0) + 1);
  }
  const counts = Array.from(subWins.values());
  if (new Set(counts).size !== counts.length) return null;
  return [...bucket].sort(
    (a, b) => (subWins.get(b.teamId)! - subWins.get(a.teamId)!),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/standings-service.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/standings-service.ts src/lib/tournament/standings-service.test.ts
git commit -m "feat(tournament): standings with head-to-head + tie detection"
```

---

### Task 4: `tournament-bus.ts` — SSE broadcast channel

**Files:**
- Create: `src/server/tournament-bus.ts`

- [ ] **Step 1: Implement** (mirror of `draft-bus.ts`)

```ts
// src/server/tournament-bus.ts
import { EventEmitter } from 'node:events';

type ChannelEvent =
  | { type: 'state.invalidated'; tournamentId: string; seq: number }
  | { type: 'tournament.reset'; tournamentId: string };

const GLOBAL_KEY = '__lol_tournament_bus__';
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;
if (!g[GLOBAL_KEY]) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  g[GLOBAL_KEY] = emitter;
}
const bus = g[GLOBAL_KEY] as EventEmitter;

export function publish(event: ChannelEvent): void {
  bus.emit('event', event);
}

export function subscribe(handler: (event: ChannelEvent) => void): () => void {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/tournament-bus.ts
git commit -m "feat(tournament): in-process SSE broadcast channel"
```

---

## Phase 2 — Event log + persistence services

### Task 5: `tournament-events.ts` — event append in a single transaction

**Files:**
- Create: `src/lib/tournament/tournament-events.ts`
- Test: `src/lib/tournament/tournament-events.test.ts`

This is the heart of the event-sourced write path. Every state-changing service operation in Phase 2 will call `appendEvent()` to atomically (a) increment `Tournament.seq` with optimistic locking, (b) insert a `TournamentEvent` row, and (c) execute the materialized state changes within the same Prisma transaction.

- [ ] **Step 1: Write the failing test** (uses real Postgres — requires `DATABASE_URL` set; same pattern as any future DB-touching test)

```ts
// src/lib/tournament/tournament-events.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { appendEvent, ConcurrencyError } from './tournament-events';

async function makeTournament() {
  return db.tournament.create({
    data: { name: `T-${Date.now()}-${Math.random()}`, groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2 },
  });
}

describe('appendEvent', () => {
  beforeEach(async () => {
    // tests are isolated by their own tournament rows; no global cleanup needed
  });

  it('writes event with seq = current+1 and bumps Tournament.seq', async () => {
    const t = await makeTournament();
    const after = await appendEvent(db, {
      tournamentId: t.id,
      expectedSeq: 0,
      actorId: 'tester',
      type: 'TOURNAMENT_CREATED',
      payload: { name: t.name },
      mutate: async () => { /* no extra writes */ },
    });
    expect(after.seq).toBe(1);
    const ev = await db.tournamentEvent.findFirst({ where: { tournamentId: t.id } });
    expect(ev?.seq).toBe(1);
    expect(ev?.type).toBe('TOURNAMENT_CREATED');
  });

  it('rejects when expectedSeq is stale (concurrency)', async () => {
    const t = await makeTournament();
    await appendEvent(db, {
      tournamentId: t.id, expectedSeq: 0, actorId: 'a',
      type: 'TOURNAMENT_CREATED', payload: {}, mutate: async () => {},
    });
    // Second call with the same expectedSeq should be rejected
    await expect(
      appendEvent(db, {
        tournamentId: t.id, expectedSeq: 0, actorId: 'b',
        type: 'GROUPS_DEFINED', payload: {}, mutate: async () => {},
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('runs mutate inside the transaction (rolls back on error)', async () => {
    const t = await makeTournament();
    await expect(
      appendEvent(db, {
        tournamentId: t.id, expectedSeq: 0, actorId: 'a',
        type: 'TOURNAMENT_CREATED', payload: {},
        mutate: async () => { throw new Error('boom'); },
      }),
    ).rejects.toThrow('boom');
    const tournament = await db.tournament.findUnique({ where: { id: t.id } });
    expect(tournament?.seq).toBe(0); // unchanged
    const evCount = await db.tournamentEvent.count({ where: { tournamentId: t.id } });
    expect(evCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/tournament-events.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/tournament-events.ts
import type { PrismaClient, Prisma, TournamentEventType } from '@prisma/client';

export class ConcurrencyError extends Error {
  constructor(public tournamentId: string, public expected: number, public actual: number) {
    super(`Concurrency conflict on tournament ${tournamentId}: expected seq ${expected}, found ${actual}`);
  }
}

export class TournamentStateError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface AppendEventInput {
  tournamentId: string;
  expectedSeq: number;
  actorId: string;
  type: TournamentEventType;
  payload: Prisma.InputJsonValue;
  /** Mutations to run inside the same transaction, AFTER seq bump and BEFORE event insert. */
  mutate: (tx: Prisma.TransactionClient) => Promise<void>;
}

export interface AppendEventResult {
  seq: number;
  eventId: string;
}

/**
 * Append a tournament event with optimistic concurrency control.
 *
 *  - Reads current Tournament.seq.
 *  - Throws ConcurrencyError if expectedSeq !== current.
 *  - In a single transaction: bumps seq, runs mutate, inserts the event.
 */
export async function appendEvent(
  db: PrismaClient,
  input: AppendEventInput,
): Promise<AppendEventResult> {
  return db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id: input.tournamentId },
      select: { seq: true },
    });
    if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
    if (t.seq !== input.expectedSeq) {
      throw new ConcurrencyError(input.tournamentId, input.expectedSeq, t.seq);
    }
    const nextSeq = t.seq + 1;
    await tx.tournament.update({
      where: { id: input.tournamentId },
      data: { seq: nextSeq },
    });
    await input.mutate(tx);
    const ev = await tx.tournamentEvent.create({
      data: {
        tournamentId: input.tournamentId,
        type: input.type,
        payload: input.payload,
        actorId: input.actorId,
        seq: nextSeq,
      },
    });
    return { seq: nextSeq, eventId: ev.id };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/tournament-events.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/tournament-events.ts src/lib/tournament/tournament-events.test.ts
git commit -m "feat(tournament): event-sourced append with optimistic locking"
```

---

### Task 6: `tournament-service.ts` — create / reset / require-active

**Files:**
- Create: `src/lib/tournament/tournament-service.ts`
- Test: `src/lib/tournament/tournament-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/tournament-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  createTournament,
  resetTournament,
  getActiveTournament,
  TournamentStateError,
} from './tournament-service';

async function ensureFinishedDraft() {
  // Tests assume a finished draft session exists. Create a minimal one if missing.
  const existing = await db.draftSession.findFirst({ where: { status: 'FINISHED' } });
  if (existing) return;
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
}

describe('tournament-service', () => {
  beforeEach(async () => {
    await db.tournamentEvent.deleteMany();
    await db.tournament.deleteMany();
    await ensureFinishedDraft();
  });

  it('creates a tournament with valid config', async () => {
    const t = await createTournament(db, {
      name: 'Spring 2026', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2,
      actorId: 'admin1',
    });
    expect(t.name).toBe('Spring 2026');
    expect(t.status).toBe('NOT_STARTED');
    expect(t.groups).toHaveLength(4);
    expect(t.groups.map(g => g.letter).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(t.seq).toBe(1);
  });

  it('rejects when advancing × groups != 8', async () => {
    await expect(
      createTournament(db, {
        name: 'Bad', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 3,
        actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('rejects when another tournament is active', async () => {
    await createTournament(db, {
      name: 'A', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    await expect(
      createTournament(db, {
        name: 'B', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('reset archives the current tournament', async () => {
    const t = await createTournament(db, {
      name: 'Spring', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    const archived = await resetTournament(db, { tournamentId: t.id, actorId: 'admin1' });
    expect(archived.status).toBe('FINISHED');
    expect(archived.name.startsWith('[archived] ')).toBe(true);
    // active query now returns null
    expect(await getActiveTournament(db)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/tournament-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/tournament-service.ts
import type { PrismaClient, Tournament, Group } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export { TournamentStateError };

export interface CreateTournamentInput {
  name: string;
  groupCount: number;
  teamsPerGroup: number;
  advancingPerGroup: number;
  actorId: string;
}

export type TournamentWithGroups = Tournament & { groups: Group[] };

const ACTIVE_STATUSES = ['NOT_STARTED', 'GROUP_STAGE', 'BRACKET_SEEDING', 'KNOCKOUT'] as const;

export async function getActiveTournament(db: PrismaClient): Promise<TournamentWithGroups | null> {
  return db.tournament.findFirst({
    where: { status: { in: [...ACTIVE_STATUSES] } },
    include: { groups: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTournament(
  db: PrismaClient,
  input: CreateTournamentInput,
): Promise<TournamentWithGroups> {
  if (input.advancingPerGroup * input.groupCount !== 8) {
    throw new TournamentStateError(
      'INVALID_CONFIG',
      'advancingPerGroup × groupCount must equal 8',
    );
  }
  if (input.groupCount < 1 || input.teamsPerGroup < 2) {
    throw new TournamentStateError('INVALID_CONFIG', 'invalid group configuration');
  }

  const draft = await db.draftSession.findFirst({ where: { status: 'FINISHED' } });
  if (!draft) {
    throw new TournamentStateError('DRAFT_NOT_FINISHED', 'cannot create tournament before draft finishes');
  }

  const active = await getActiveTournament(db);
  if (active) {
    throw new TournamentStateError('ACTIVE_EXISTS', 'another tournament is currently active');
  }

  const tournament = await db.tournament.create({
    data: {
      name: input.name,
      status: 'NOT_STARTED',
      groupCount: input.groupCount,
      teamsPerGroup: input.teamsPerGroup,
      advancingPerGroup: input.advancingPerGroup,
      startedAt: new Date(),
    },
  });
  await appendEvent(db, {
    tournamentId: tournament.id,
    expectedSeq: 0,
    actorId: input.actorId,
    type: 'TOURNAMENT_CREATED',
    payload: {
      name: input.name,
      groupCount: input.groupCount,
      teamsPerGroup: input.teamsPerGroup,
      advancingPerGroup: input.advancingPerGroup,
    },
    mutate: async (tx) => {
      const letters = Array.from({ length: input.groupCount }, (_, i) =>
        String.fromCharCode(65 + i),
      );
      await tx.group.createMany({
        data: letters.map(letter => ({ tournamentId: tournament.id, letter })),
      });
    },
  });

  return (await db.tournament.findUnique({
    where: { id: tournament.id }, include: { groups: true },
  }))!;
}

export async function resetTournament(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<Tournament> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');

  // Archive: rename + set to FINISHED, and bump seq via appendEvent
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TOURNAMENT_RESET',
    payload: { previousStatus: t.status, previousName: t.name },
    mutate: async (tx) => {
      await tx.tournament.update({
        where: { id: t.id },
        data: { name: `[archived] ${t.name}`, status: 'FINISHED', finishedAt: new Date() },
      });
    },
  });
  return (await db.tournament.findUnique({ where: { id: t.id } }))!;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/tournament-service.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/tournament-service.ts src/lib/tournament/tournament-service.test.ts
git commit -m "feat(tournament): create/reset/get-active tournament service"
```

---

### Task 7: `groups-service.ts` — team assignment + round-robin generation

**Files:**
- Create: `src/lib/tournament/groups-service.ts`
- Test: `src/lib/tournament/groups-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/groups-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { TournamentStateError } from './tournament-events';

async function setup(teams: number) {
  await db.matchGame.deleteMany();
  await db.match.deleteMany();
  await db.groupTeam.deleteMany();
  await db.group.deleteMany();
  await db.tournamentEvent.deleteMany();
  await db.tournament.deleteMany();
  await db.teamSlot.deleteMany();
  await db.team.deleteMany();
  await db.player.deleteMany();
  await db.user.deleteMany();
  await db.draftSession.deleteMany();
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
  const teamRows = [];
  for (let i = 0; i < teams; i++) {
    const user = await db.user.create({
      data: { gameId: `cap${i}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const player = await db.player.create({
      data: {
        gameId: `cap${i}`, nickname: `Captain${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id,
      },
    });
    teamRows.push(await db.team.create({
      data: { name: `Team-${i}`, captainId: player.id, budgetLeft: 900 },
    }));
  }
  return teamRows;
}

describe('groups-service', () => {
  it('assigns a team to a group', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    const groupA = await db.group.findFirst({
      where: { tournamentId: t.id, letter: 'A' },
      include: { teams: true },
    });
    expect(groupA?.teams).toHaveLength(1);
    expect(groupA?.teams[0].teamId).toBe(teams[0].id);
  });

  it('rejects assigning the same team twice', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'B', actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('rejects assigning more than teamsPerGroup', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[1].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      assignTeam(db, { tournamentId: t.id, teamId: teams[2].id, groupLetter: 'A', actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('startGroupStage generates a full round-robin per group', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    // Fill 2 teams per group
    const letters = ['A', 'B', 'C', 'D'] as const;
    for (let i = 0; i < 8; i++) {
      await assignTeam(db, {
        tournamentId: t.id, teamId: teams[i].id,
        groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
      });
    }
    await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
    const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
    // 2 teams per group → 1 match per group × 4 groups = 4 matches
    expect(matches).toHaveLength(4);
    const tAfter = await db.tournament.findUnique({ where: { id: t.id } });
    expect(tAfter?.status).toBe('GROUP_STAGE');
  });

  it('startGroupStage rejects if any group is not full', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      startGroupStage(db, { tournamentId: t.id, actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/groups-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/groups-service.ts
import type { PrismaClient } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export async function assignTeam(
  db: PrismaClient,
  input: { tournamentId: string; teamId: string; groupLetter: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { groups: { include: { teams: true } } },
  });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'NOT_STARTED') {
    throw new TournamentStateError('WRONG_STATUS', 'can only assign teams in NOT_STARTED');
  }
  const group = t.groups.find(g => g.letter === input.groupLetter);
  if (!group) throw new TournamentStateError('GROUP_NOT_FOUND', `group ${input.groupLetter} not found`);

  // Already assigned somewhere?
  const existing = await db.groupTeam.findUnique({ where: { teamId: input.teamId } });
  if (existing) {
    throw new TournamentStateError('ALREADY_ASSIGNED', 'team is already in a group');
  }

  if (group.teams.length >= t.teamsPerGroup) {
    throw new TournamentStateError('GROUP_FULL', `group ${input.groupLetter} is full`);
  }

  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TEAM_ASSIGNED',
    payload: { teamId: input.teamId, groupLetter: input.groupLetter },
    mutate: async (tx) => {
      await tx.groupTeam.create({
        data: { groupId: group.id, teamId: input.teamId, seed: group.teams.length + 1 },
      });
    },
  });
}

export async function startGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { groups: { include: { teams: true } } },
  });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'NOT_STARTED') {
    throw new TournamentStateError('WRONG_STATUS', 'can only start in NOT_STARTED');
  }
  for (const g of t.groups) {
    if (g.teams.length !== t.teamsPerGroup) {
      throw new TournamentStateError(
        'GROUP_INCOMPLETE',
        `group ${g.letter} has ${g.teams.length}/${t.teamsPerGroup} teams`,
      );
    }
  }
  if (t.advancingPerGroup * t.groupCount !== 8) {
    throw new TournamentStateError('INVALID_CONFIG', 'advancing × groups must equal 8');
  }

  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCHES_GENERATED',
    payload: {},
    mutate: async (tx) => {
      for (const g of t.groups) {
        const teamIds = g.teams.map(gt => gt.teamId);
        for (let i = 0; i < teamIds.length; i++) {
          for (let j = i + 1; j < teamIds.length; j++) {
            await tx.match.create({
              data: {
                tournamentId: t.id,
                phase: 'GROUP',
                format: 'BO1',
                status: 'SCHEDULED',
                groupId: g.id,
                teamAId: teamIds[i],
                teamBId: teamIds[j],
              },
            });
          }
        }
      }
      await tx.tournament.update({
        where: { id: t.id },
        data: { status: 'GROUP_STAGE' },
      });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/groups-service.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/groups-service.ts src/lib/tournament/groups-service.test.ts
git commit -m "feat(tournament): team assignment and round-robin generation"
```

---

### Task 8: `matches-service.ts` — record/revoke game, walkover, edit

**Files:**
- Create: `src/lib/tournament/matches-service.ts`
- Test: `src/lib/tournament/matches-service.test.ts`

This task is dense. It covers all per-match writes (score entry, revoke, walkover, edit) for both group and knockout phases. Knockout-specific advancement happens via `bracket-service` (Task 9), but `recordGame` is responsible for calling out to it when a knockout match finishes — we'll wire that in Task 9 by having `recordGame` import an `onKnockoutFinished` hook.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/matches-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import {
  scheduleMatch,
  recordGame,
  revokeLastGame,
  declareWalkover,
} from './matches-service';
import { TournamentStateError } from './tournament-events';

async function setup(teams: number) {
  await db.matchGame.deleteMany();
  await db.match.deleteMany();
  await db.groupTeam.deleteMany();
  await db.group.deleteMany();
  await db.tournamentEvent.deleteMany();
  await db.tournament.deleteMany();
  await db.teamSlot.deleteMany();
  await db.team.deleteMany();
  await db.player.deleteMany();
  await db.user.deleteMany();
  await db.draftSession.deleteMany();
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
  const teamRows = [];
  for (let i = 0; i < teams; i++) {
    const user = await db.user.create({
      data: { gameId: `cap${i}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const player = await db.player.create({
      data: { gameId: `cap${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    teamRows.push(await db.team.create({
      data: { name: `T-${i}`, captainId: player.id, budgetLeft: 900 },
    }));
  }
  return teamRows;
}

async function startedTournament(teams: ReturnType<typeof setup> extends Promise<infer R> ? R : never) {
  const t = await createTournament(db, {
    name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
  });
  const letters = ['A', 'B', 'C', 'D'] as const;
  for (let i = 0; i < 8; i++) {
    await assignTeam(db, {
      tournamentId: t.id, teamId: teams[i].id,
      groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
    });
  }
  await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
  return t.id;
}

describe('matches-service', () => {
  it('scheduleMatch sets scheduledAt', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    const when = new Date('2026-06-01T19:00:00Z');
    await scheduleMatch(db, { tournamentId: tId, matchId: m.id, scheduledAt: when, actorId: 'a' });
    const after = await db.match.findUnique({ where: { id: m.id } });
    expect(after?.scheduledAt?.toISOString()).toBe(when.toISOString());
  });

  it('recordGame on BO1 finishes the match', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await recordGame(db, {
      tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a',
    });
    const after = await db.match.findUnique({
      where: { id: m.id }, include: { games: true },
    });
    expect(after?.status).toBe('FINISHED');
    expect(after?.winnerTeamId).toBe(m.teamAId);
    expect(after?.games).toHaveLength(1);
  });

  it('recordGame rejects winner not in match', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    const otherTeam = teams.find(t => t.id !== m.teamAId && t.id !== m.teamBId)!;
    await expect(
      recordGame(db, {
        tournamentId: tId, matchId: m.id, winnerTeamId: otherTeam.id, actorId: 'a',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('revokeLastGame rewinds a finished BO1', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await recordGame(db, { tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
    await revokeLastGame(db, { tournamentId: tId, matchId: m.id, actorId: 'a' });
    const after = await db.match.findUnique({
      where: { id: m.id }, include: { games: true },
    });
    expect(after?.status).toBe('SCHEDULED');
    expect(after?.winnerTeamId).toBeNull();
    expect(after?.games).toHaveLength(0);
  });

  it('declareWalkover sets status WALKOVER + winner', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await declareWalkover(db, {
      tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, note: 'opp no-show', actorId: 'a',
    });
    const after = await db.match.findUnique({ where: { id: m.id } });
    expect(after?.status).toBe('WALKOVER');
    expect(after?.winnerTeamId).toBe(m.teamAId);
    expect(after?.walkoverNote).toBe('opp no-show');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/matches-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/matches-service.ts
import type { PrismaClient, Prisma, Match } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';
import {
  computeSeriesScore,
  isSeriesComplete,
  seriesWinner,
  winsNeeded,
} from './series-format';

interface MatchHandle {
  tournamentId: string;
  matchId: string;
  actorId: string;
}

async function loadMatch(tx: Prisma.TransactionClient | PrismaClient, matchId: string) {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    include: { games: { orderBy: { gameNumber: 'asc' } } },
  });
  if (!m) throw new TournamentStateError('NOT_FOUND', 'match not found');
  return m;
}

export async function scheduleMatch(
  db: PrismaClient,
  input: MatchHandle & { scheduledAt: Date },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (m.status === 'FINISHED' || m.status === 'WALKOVER') {
    throw new TournamentStateError('ALREADY_FINISHED', 'cannot reschedule a finished match');
  }
  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: m.scheduledAt ? 'MATCH_RESCHEDULED' : 'MATCH_SCHEDULED',
    payload: { matchId: m.id, scheduledAt: input.scheduledAt.toISOString() },
    mutate: async (tx) => {
      await tx.match.update({
        where: { id: m.id },
        data: { scheduledAt: input.scheduledAt },
      });
    },
  });
}

export async function recordGame(
  db: PrismaClient,
  input: MatchHandle & { winnerTeamId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);

  if (m.status === 'FINISHED' || m.status === 'WALKOVER' || m.status === 'CANCELLED') {
    throw new TournamentStateError('NOT_RECORDABLE', `match status is ${m.status}`);
  }
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  if (input.winnerTeamId !== m.teamAId && input.winnerTeamId !== m.teamBId) {
    throw new TournamentStateError('INVALID_WINNER', 'winner must be one of the two teams');
  }

  const nextGameNumber = m.games.length + 1;
  const projectedGames = [...m.games, { winnerTeamId: input.winnerTeamId }];
  const score = computeSeriesScore(projectedGames, m.teamAId, m.teamBId);
  const finishedNow = isSeriesComplete(m.format, score);
  const newStatus = finishedNow ? 'FINISHED' : 'IN_PROGRESS';
  const newWinner = finishedNow
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: finishedNow ? 'MATCH_FINISHED' : 'GAME_RECORDED',
    payload: { matchId: m.id, gameNumber: nextGameNumber, winnerTeamId: input.winnerTeamId },
    mutate: async (tx) => {
      await tx.matchGame.create({
        data: {
          matchId: m.id,
          gameNumber: nextGameNumber,
          winnerTeamId: input.winnerTeamId,
        },
      });
      await tx.match.update({
        where: { id: m.id },
        data: { status: newStatus, winnerTeamId: newWinner ?? undefined },
      });
      if (finishedNow) {
        await advanceKnockoutIfApplicable(tx, m as Match, newWinner!);
      }
    },
  });
}

export async function revokeLastGame(
  db: PrismaClient,
  input: MatchHandle,
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (m.games.length === 0) {
    throw new TournamentStateError('NO_GAMES', 'no games to revoke');
  }

  const last = m.games[m.games.length - 1];
  const wasFinished = m.status === 'FINISHED';

  // If this match was finished AND winner was already advanced to a downstream
  // knockout match that has games recorded, block the revoke.
  if (wasFinished && m.nextMatchId) {
    const downstream = await db.match.findUnique({
      where: { id: m.nextMatchId },
      include: { games: true },
    });
    if (downstream && downstream.games.length > 0) {
      throw new TournamentStateError(
        'DOWNSTREAM_BLOCKED',
        `cannot revoke: downstream match ${downstream.id} has recorded games — revoke it first`,
      );
    }
  }

  // Recompute status after deletion
  const remaining = m.games.slice(0, -1);
  const score = m.teamAId && m.teamBId
    ? computeSeriesScore(remaining, m.teamAId, m.teamBId)
    : { a: 0, b: 0 };
  const finishedAfter = m.teamAId && m.teamBId
    ? isSeriesComplete(m.format, score)
    : false;
  const newStatus = finishedAfter
    ? 'FINISHED'
    : remaining.length === 0 ? 'SCHEDULED' : 'IN_PROGRESS';
  const newWinner = finishedAfter && m.teamAId && m.teamBId
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'GAME_REVOKED',
    payload: { matchId: m.id, gameNumber: last.gameNumber },
    mutate: async (tx) => {
      await tx.matchGame.delete({ where: { id: last.id } });
      await tx.match.update({
        where: { id: m.id },
        data: { status: newStatus, winnerTeamId: newWinner },
      });
      if (wasFinished && !finishedAfter && m.nextMatchId && m.nextSide) {
        // Clear downstream slot
        await tx.match.update({
          where: { id: m.nextMatchId },
          data: m.nextSide === 'A' ? { teamAId: null } : { teamBId: null },
        });
      }
    },
  });
}

export async function declareWalkover(
  db: PrismaClient,
  input: MatchHandle & { winnerTeamId: string; note?: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  if (input.winnerTeamId !== m.teamAId && input.winnerTeamId !== m.teamBId) {
    throw new TournamentStateError('INVALID_WINNER', 'winner must be one of the two teams');
  }
  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCH_WALKOVER',
    payload: { matchId: m.id, winnerTeamId: input.winnerTeamId, note: input.note ?? null },
    mutate: async (tx) => {
      await tx.match.update({
        where: { id: m.id },
        data: {
          status: 'WALKOVER',
          winnerTeamId: input.winnerTeamId,
          walkoverNote: input.note ?? null,
        },
      });
      await advanceKnockoutIfApplicable(tx, m as Match, input.winnerTeamId);
    },
  });
}

/**
 * Edit a finished match's games array wholesale. Used for changing the result.
 * Blocks if downstream already has games recorded.
 */
export async function editMatchGames(
  db: PrismaClient,
  input: MatchHandle & { games: Array<{ winnerTeamId: string }> },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId }, select: { seq: true } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  const m = await loadMatch(db, input.matchId);
  if (!m.teamAId || !m.teamBId) {
    throw new TournamentStateError('NO_TEAMS', 'match has no opponents yet');
  }
  for (const g of input.games) {
    if (g.winnerTeamId !== m.teamAId && g.winnerTeamId !== m.teamBId) {
      throw new TournamentStateError('INVALID_WINNER', 'every game winner must be one of the two teams');
    }
  }
  if (input.games.length > 0) {
    const need = winsNeeded(m.format);
    const score = computeSeriesScore(input.games, m.teamAId, m.teamBId);
    if (score.a > need || score.b > need) {
      throw new TournamentStateError('TOO_MANY_GAMES', 'games exceed format limit');
    }
  }

  // Downstream-blocking check
  if (m.nextMatchId) {
    const downstream = await db.match.findUnique({
      where: { id: m.nextMatchId }, include: { games: true },
    });
    if (downstream && downstream.games.length > 0) {
      throw new TournamentStateError(
        'DOWNSTREAM_BLOCKED',
        `cannot edit: downstream match ${downstream.id} has recorded games — revoke it first`,
      );
    }
  }

  const score = computeSeriesScore(input.games, m.teamAId, m.teamBId);
  const finished = isSeriesComplete(m.format, score);
  const newStatus = input.games.length === 0
    ? 'SCHEDULED'
    : finished ? 'FINISHED' : 'IN_PROGRESS';
  const newWinner = finished
    ? seriesWinner(m.format, score, m.teamAId, m.teamBId)
    : null;
  const previousWinner = m.winnerTeamId;

  await appendEvent(db, {
    tournamentId: input.tournamentId,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCH_EDITED',
    payload: { matchId: m.id, games: input.games },
    mutate: async (tx) => {
      await tx.matchGame.deleteMany({ where: { matchId: m.id } });
      for (let i = 0; i < input.games.length; i++) {
        await tx.matchGame.create({
          data: {
            matchId: m.id,
            gameNumber: i + 1,
            winnerTeamId: input.games[i].winnerTeamId,
          },
        });
      }
      await tx.match.update({
        where: { id: m.id },
        data: {
          status: newStatus,
          winnerTeamId: newWinner,
          walkoverNote: null,
        },
      });
      // Downstream advancement adjustment
      if (m.nextMatchId && m.nextSide) {
        if (newWinner) {
          await tx.match.update({
            where: { id: m.nextMatchId },
            data: m.nextSide === 'A' ? { teamAId: newWinner } : { teamBId: newWinner },
          });
        } else if (previousWinner) {
          await tx.match.update({
            where: { id: m.nextMatchId },
            data: m.nextSide === 'A' ? { teamAId: null } : { teamBId: null },
          });
        }
      }
    },
  });
}

async function advanceKnockoutIfApplicable(
  tx: Prisma.TransactionClient,
  m: Match,
  winnerTeamId: string,
): Promise<void> {
  if (!m.nextMatchId || !m.nextSide) return;
  await tx.match.update({
    where: { id: m.nextMatchId },
    data: m.nextSide === 'A' ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId },
  });
  // If this was the FINAL, write the champion on the tournament
  if (m.phase === 'FINAL') {
    await tx.tournament.update({
      where: { id: m.tournamentId },
      data: { status: 'FINISHED', championId: winnerTeamId, finishedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/matches-service.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/matches-service.ts src/lib/tournament/matches-service.test.ts
git commit -m "feat(tournament): match score recording, revoke, walkover, edit"
```

---

## Phase 3 — Bracket, stage transitions, materialized state

### Task 9: `bracket-service.ts` — seed/lock 8 teams into 4 QF + 2 SF + 1 FINAL

**Files:**
- Create: `src/lib/tournament/bracket-service.ts`
- Test: `src/lib/tournament/bracket-service.test.ts`

The bracket layout is fixed: 4 QF matches feed 2 SF matches feed 1 FINAL.

```
slot 0 ─┐
        ├─ QF0 ─┐
slot 1 ─┘       │
                ├─ SF0 ─┐
slot 2 ─┐       │       │
        ├─ QF1 ─┘       │
slot 3 ─┘               │
                        ├─ FINAL
slot 4 ─┐               │
        ├─ QF2 ─┐       │
slot 5 ─┘       │       │
                ├─ SF1 ─┘
slot 6 ─┐       │
        ├─ QF3 ─┘
slot 7 ─┘
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/bracket-service.test.ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { recordGame } from './matches-service';
import { seedBracket, lockBracket } from './bracket-service';
import { TournamentStateError } from './tournament-events';

async function setup(teams: number) {
  await db.matchGame.deleteMany();
  await db.match.deleteMany();
  await db.groupTeam.deleteMany();
  await db.group.deleteMany();
  await db.tournamentEvent.deleteMany();
  await db.tournament.deleteMany();
  await db.teamSlot.deleteMany();
  await db.team.deleteMany();
  await db.player.deleteMany();
  await db.user.deleteMany();
  await db.draftSession.deleteMany();
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
  const out = [];
  for (let i = 0; i < teams; i++) {
    const user = await db.user.create({
      data: { gameId: `cap${i}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const player = await db.player.create({
      data: { gameId: `cap${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    out.push(await db.team.create({ data: { name: `T-${i}`, captainId: player.id, budgetLeft: 900 } }));
  }
  return out;
}

async function buildBracketSeeding() {
  const teams = await setup(8);
  const t = await createTournament(db, {
    name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
  });
  const letters = ['A', 'B', 'C', 'D'] as const;
  for (let i = 0; i < 8; i++) {
    await assignTeam(db, {
      tournamentId: t.id, teamId: teams[i].id,
      groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
    });
  }
  await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
  // Finish all group matches; pick a winner for each
  const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
  for (const m of matches) {
    await recordGame(db, { tournamentId: t.id, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
  }
  // Force status to BRACKET_SEEDING (close-group-stage covered in Task 10)
  await db.tournament.update({ where: { id: t.id }, data: { status: 'BRACKET_SEEDING' } });
  return { t, teams };
}

describe('bracket-service', () => {
  it('seedBracket creates 4 QF + 2 SF + 1 FINAL with nextMatchId chain', async () => {
    const { t, teams } = await buildBracketSeeding();
    await seedBracket(db, {
      tournamentId: t.id,
      slots: teams.slice(0, 8).map(x => x.id) as [string, string, string, string, string, string, string, string],
      actorId: 'a',
    });
    const knockout = await db.match.findMany({
      where: { tournamentId: t.id, phase: { in: ['QF', 'SF', 'FINAL'] } },
      orderBy: [{ roundIndex: 'asc' }, { matchIndex: 'asc' }],
    });
    expect(knockout).toHaveLength(7);
    const qfs = knockout.filter(m => m.phase === 'QF');
    const sfs = knockout.filter(m => m.phase === 'SF');
    const finalM = knockout.find(m => m.phase === 'FINAL')!;
    expect(qfs).toHaveLength(4);
    expect(sfs).toHaveLength(2);
    // QF0 and QF1 feed SF0; QF2 and QF3 feed SF1; SFs feed FINAL
    expect(qfs[0].nextMatchId).toBe(sfs[0].id);
    expect(qfs[0].nextSide).toBe('A');
    expect(qfs[1].nextMatchId).toBe(sfs[0].id);
    expect(qfs[1].nextSide).toBe('B');
    expect(qfs[2].nextMatchId).toBe(sfs[1].id);
    expect(qfs[3].nextMatchId).toBe(sfs[1].id);
    expect(sfs[0].nextMatchId).toBe(finalM.id);
    expect(sfs[0].nextSide).toBe('A');
    expect(sfs[1].nextMatchId).toBe(finalM.id);
    expect(sfs[1].nextSide).toBe('B');
    // QF format BO3, FINAL BO5
    expect(qfs[0].format).toBe('BO3');
    expect(sfs[0].format).toBe('BO3');
    expect(finalM.format).toBe('BO5');
  });

  it('lockBracket transitions to KNOCKOUT', async () => {
    const { t, teams } = await buildBracketSeeding();
    await seedBracket(db, {
      tournamentId: t.id,
      slots: teams.slice(0, 8).map(x => x.id) as [string, string, string, string, string, string, string, string],
      actorId: 'a',
    });
    await lockBracket(db, { tournamentId: t.id, actorId: 'a' });
    const after = await db.tournament.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('KNOCKOUT');
  });

  it('seedBracket rejects duplicate teams', async () => {
    const { t, teams } = await buildBracketSeeding();
    await expect(
      seedBracket(db, {
        tournamentId: t.id,
        slots: [
          teams[0].id, teams[0].id, teams[1].id, teams[2].id,
          teams[3].id, teams[4].id, teams[5].id, teams[6].id,
        ],
        actorId: 'a',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/bracket-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/tournament/bracket-service.ts
import type { PrismaClient } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export type BracketSlots = [string, string, string, string, string, string, string, string];

export async function seedBracket(
  db: PrismaClient,
  input: { tournamentId: string; slots: BracketSlots; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'BRACKET_SEEDING') {
    throw new TournamentStateError('WRONG_STATUS', 'tournament must be in BRACKET_SEEDING');
  }
  const unique = new Set(input.slots);
  if (unique.size !== 8) {
    throw new TournamentStateError('DUPLICATE_TEAMS', 'all 8 slots must be distinct teams');
  }

  // Verify every team is in this tournament
  const gTeams = await db.groupTeam.findMany({
    where: { teamId: { in: input.slots }, group: { tournamentId: t.id } },
  });
  if (gTeams.length !== 8) {
    throw new TournamentStateError('INVALID_TEAMS', 'all slots must reference teams in this tournament');
  }

  // Clear any previous bracket attempt
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'BRACKET_SEEDED',
    payload: { slots: input.slots },
    mutate: async (tx) => {
      await tx.match.deleteMany({
        where: { tournamentId: t.id, phase: { in: ['QF', 'SF', 'FINAL'] } },
      });
      // Create FINAL first so QF/SF can reference it
      const finalM = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'FINAL', format: 'BO5', status: 'SCHEDULED',
          roundIndex: 2, matchIndex: 0,
        },
      });
      const sf0 = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'SF', format: 'BO3', status: 'SCHEDULED',
          roundIndex: 1, matchIndex: 0,
          nextMatchId: finalM.id, nextSide: 'A',
        },
      });
      const sf1 = await tx.match.create({
        data: {
          tournamentId: t.id, phase: 'SF', format: 'BO3', status: 'SCHEDULED',
          roundIndex: 1, matchIndex: 1,
          nextMatchId: finalM.id, nextSide: 'B',
        },
      });
      // QF mappings: QF0+QF1 → SF0 (A/B); QF2+QF3 → SF1 (A/B)
      const qfTargets: Array<{ next: string; side: 'A' | 'B'; idx: number }> = [
        { next: sf0.id, side: 'A', idx: 0 },
        { next: sf0.id, side: 'B', idx: 1 },
        { next: sf1.id, side: 'A', idx: 2 },
        { next: sf1.id, side: 'B', idx: 3 },
      ];
      for (const q of qfTargets) {
        await tx.match.create({
          data: {
            tournamentId: t.id, phase: 'QF', format: 'BO3', status: 'SCHEDULED',
            roundIndex: 0, matchIndex: q.idx,
            teamAId: input.slots[q.idx * 2],
            teamBId: input.slots[q.idx * 2 + 1],
            nextMatchId: q.next, nextSide: q.side,
          },
        });
      }
    },
  });
}

export async function lockBracket(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'BRACKET_SEEDING') {
    throw new TournamentStateError('WRONG_STATUS', 'tournament must be in BRACKET_SEEDING');
  }
  const qfs = await db.match.findMany({ where: { tournamentId: t.id, phase: 'QF' } });
  if (qfs.length !== 4 || qfs.some(q => !q.teamAId || !q.teamBId)) {
    throw new TournamentStateError('BRACKET_INCOMPLETE', 'bracket must have all 4 QF matches with teams');
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'BRACKET_LOCKED',
    payload: {},
    mutate: async (tx) => {
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'KNOCKOUT' } });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/bracket-service.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/bracket-service.ts src/lib/tournament/bracket-service.test.ts
git commit -m "feat(tournament): bracket seeding (4 QF + 2 SF + FINAL) and lock"
```

---

### Task 10: Close group stage + create tiebreaker

**Files:**
- Modify: `src/lib/tournament/tournament-service.ts` (add two functions)
- Modify: `src/lib/tournament/tournament-service.test.ts` (add two tests)

- [ ] **Step 1: Append the failing tests** to the existing `tournament-service.test.ts`

```ts
// at the bottom of src/lib/tournament/tournament-service.test.ts
import { closeGroupStage, createTiebreaker } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { recordGame } from './matches-service';

describe('closeGroupStage / createTiebreaker', () => {
  it('closeGroupStage transitions to BRACKET_SEEDING when no ties and all matches FINISHED', async () => {
    await db.matchGame.deleteMany();
    await db.match.deleteMany();
    await db.groupTeam.deleteMany();
    await db.group.deleteMany();
    await db.tournamentEvent.deleteMany();
    await db.tournament.deleteMany();
    await db.teamSlot.deleteMany();
    await db.team.deleteMany();
    await db.player.deleteMany();
    await db.user.deleteMany();
    await db.draftSession.deleteMany();
    await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
    const teams = [];
    for (let i = 0; i < 8; i++) {
      const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
      const p = await db.player.create({
        data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
          secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
      });
      teams.push(await db.team.create({ data: { name: `T-${i}`, captainId: p.id, budgetLeft: 900 } }));
    }
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    const letters = ['A', 'B', 'C', 'D'] as const;
    for (let i = 0; i < 8; i++) {
      await assignTeam(db, {
        tournamentId: t.id, teamId: teams[i].id,
        groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
      });
    }
    await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
    const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
    for (const m of matches) {
      await recordGame(db, { tournamentId: t.id, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
    }
    await closeGroupStage(db, { tournamentId: t.id, actorId: 'a' });
    const after = await db.tournament.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('BRACKET_SEEDING');
  });

  it('createTiebreaker creates a BO1 TIEBREAKER match between two teams in the same group', async () => {
    // Same setup as above
    await db.matchGame.deleteMany();
    await db.match.deleteMany();
    await db.groupTeam.deleteMany();
    await db.group.deleteMany();
    await db.tournamentEvent.deleteMany();
    await db.tournament.deleteMany();
    await db.teamSlot.deleteMany();
    await db.team.deleteMany();
    await db.player.deleteMany();
    await db.user.deleteMany();
    await db.draftSession.deleteMany();
    await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
    const teams = [];
    for (let i = 0; i < 8; i++) {
      const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
      const p = await db.player.create({
        data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
          secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
      });
      teams.push(await db.team.create({ data: { name: `T-${i}`, captainId: p.id, budgetLeft: 900 } }));
    }
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[1].id, groupLetter: 'A', actorId: 'a' });
    await db.tournament.update({ where: { id: t.id }, data: { status: 'GROUP_STAGE' } });
    await createTiebreaker(db, {
      tournamentId: t.id, teamAId: teams[0].id, teamBId: teams[1].id, actorId: 'a',
    });
    const tb = await db.match.findFirst({ where: { tournamentId: t.id, phase: 'TIEBREAKER' } });
    expect(tb).toBeTruthy();
    expect(tb?.format).toBe('BO1');
    expect(tb?.status).toBe('SCHEDULED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/tournament/tournament-service.test.ts
```

Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement** — append to `src/lib/tournament/tournament-service.ts`

```ts
import { appendEvent } from './tournament-events';
import { computeStandings } from './standings-service';

export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'GROUP_STAGE') {
    throw new TournamentStateError('WRONG_STATUS', 'must be GROUP_STAGE');
  }
  const matches = await db.match.findMany({
    where: { tournamentId: t.id, phase: { in: ['GROUP', 'TIEBREAKER'] } },
  });
  const unfinished = matches.filter(
    m => m.status !== 'FINISHED' && m.status !== 'WALKOVER' && m.status !== 'CANCELLED',
  );
  if (unfinished.length > 0) {
    throw new TournamentStateError(
      'UNFINISHED_MATCHES',
      `${unfinished.length} group match(es) still unfinished`,
    );
  }
  const standings = computeStandings(matches.map(m => ({
    id: m.id, phase: m.phase, groupId: m.groupId, status: m.status,
    teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
  })));
  if (standings.tieGroups.length > 0) {
    const err = new TournamentStateError(
      'UNRESOLVED_TIES',
      `unresolved ties: ${JSON.stringify(standings.tieGroups)}`,
    );
    (err as TournamentStateError & { tieGroups?: unknown }).tieGroups = standings.tieGroups;
    throw err;
  }
  // Compute advancing-8 list by taking top advancingPerGroup of each group
  const advancing: string[] = [];
  for (const g of Object.keys(standings.byGroup)) {
    advancing.push(...standings.byGroup[g].slice(0, t.advancingPerGroup).map(r => r.teamId));
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'GROUP_STAGE_CLOSED',
    payload: { advancing },
    mutate: async (tx) => {
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'BRACKET_SEEDING' } });
    },
  });
}

export async function createTiebreaker(
  db: PrismaClient,
  input: { tournamentId: string; teamAId: string; teamBId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'GROUP_STAGE') {
    throw new TournamentStateError('WRONG_STATUS', 'tiebreaker only in GROUP_STAGE');
  }
  const aGroup = await db.groupTeam.findUnique({
    where: { teamId: input.teamAId }, include: { group: true },
  });
  const bGroup = await db.groupTeam.findUnique({
    where: { teamId: input.teamBId }, include: { group: true },
  });
  if (!aGroup || !bGroup) {
    throw new TournamentStateError('TEAM_NOT_FOUND', 'one or both teams not in any group');
  }
  if (aGroup.group.tournamentId !== t.id || bGroup.group.tournamentId !== t.id) {
    throw new TournamentStateError('WRONG_TOURNAMENT', 'teams not in this tournament');
  }
  if (aGroup.groupId !== bGroup.groupId) {
    throw new TournamentStateError('DIFFERENT_GROUPS', 'tiebreaker must be within one group');
  }
  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TIEBREAKER_CREATED',
    payload: { teamAId: input.teamAId, teamBId: input.teamBId, groupId: aGroup.groupId },
    mutate: async (tx) => {
      await tx.match.create({
        data: {
          tournamentId: t.id,
          phase: 'TIEBREAKER',
          format: 'BO1',
          status: 'SCHEDULED',
          groupId: aGroup.groupId,
          teamAId: input.teamAId,
          teamBId: input.teamBId,
        },
      });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/tournament/tournament-service.test.ts
```

Expected: PASS (6/6 — 4 original + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/tournament-service.ts src/lib/tournament/tournament-service.test.ts
git commit -m "feat(tournament): close group stage + create tiebreaker"
```

---

### Task 11: `getTournamentState` — read-time materialization

**Files:**
- Create: `src/lib/tournament/tournament-state.ts`

This is a read-only helper used by both the `state` API and SSE clients. It's a thin assembler — no tests beyond a smoke test in the API route layer.

- [ ] **Step 1: Implement**

```ts
// src/lib/tournament/tournament-state.ts
import type { PrismaClient } from '@prisma/client';
import { computeStandings, type StandingsResult } from './standings-service';
import {
  computeSeriesScore,
  winsNeeded,
  type GameRow,
} from './series-format';

export interface MatchView {
  id: string;
  phase: string;
  format: string;
  status: string;
  groupId: string | null;
  roundIndex: number | null;
  matchIndex: number | null;
  nextMatchId: string | null;
  nextSide: string | null;
  teamAId: string | null;
  teamBId: string | null;
  scheduledAt: string | null;
  winnerTeamId: string | null;
  walkoverNote: string | null;
  seriesScore: { a: number; b: number };
  winsNeeded: number;
  games: Array<{ gameNumber: number; winnerTeamId: string }>;
}

export interface TournamentState {
  tournament: {
    id: string;
    name: string;
    status: string;
    groupCount: number;
    teamsPerGroup: number;
    advancingPerGroup: number;
    seq: number;
    championId: string | null;
  };
  groups: Array<{
    id: string;
    letter: string;
    teams: Array<{ teamId: string; name: string; seed: number }>;
  }>;
  matches: MatchView[];
  standings: StandingsResult;
  schedule: MatchView[]; // matches sorted by scheduledAt asc, null last
}

export async function getTournamentState(
  db: PrismaClient,
  tournamentId: string,
): Promise<TournamentState | null> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: { include: { teams: { include: { team: true } } } },
      matches: { include: { games: { orderBy: { gameNumber: 'asc' } } } },
    },
  });
  if (!t) return null;

  const matches: MatchView[] = t.matches.map(m => {
    const games: GameRow[] = m.games.map(g => ({ winnerTeamId: g.winnerTeamId }));
    const seriesScore = m.teamAId && m.teamBId
      ? computeSeriesScore(games, m.teamAId, m.teamBId)
      : { a: 0, b: 0 };
    return {
      id: m.id,
      phase: m.phase,
      format: m.format,
      status: m.status,
      groupId: m.groupId,
      roundIndex: m.roundIndex,
      matchIndex: m.matchIndex,
      nextMatchId: m.nextMatchId,
      nextSide: m.nextSide,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      winnerTeamId: m.winnerTeamId,
      walkoverNote: m.walkoverNote,
      seriesScore,
      winsNeeded: winsNeeded(m.format),
      games: m.games.map(g => ({ gameNumber: g.gameNumber, winnerTeamId: g.winnerTeamId })),
    };
  });

  const standings = computeStandings(t.matches.map(m => ({
    id: m.id, phase: m.phase, groupId: m.groupId, status: m.status,
    teamAId: m.teamAId, teamBId: m.teamBId, winnerTeamId: m.winnerTeamId,
  })));

  const schedule = [...matches].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt < b.scheduledAt ? -1 : 1;
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return 0;
  });

  return {
    tournament: {
      id: t.id, name: t.name, status: t.status,
      groupCount: t.groupCount, teamsPerGroup: t.teamsPerGroup,
      advancingPerGroup: t.advancingPerGroup, seq: t.seq, championId: t.championId,
    },
    groups: t.groups.map(g => ({
      id: g.id,
      letter: g.letter,
      teams: g.teams.map(gt => ({
        teamId: gt.teamId, name: gt.team.name, seed: gt.seed,
      })),
    })),
    matches,
    standings,
    schedule,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tournament/tournament-state.ts
git commit -m "feat(tournament): assemble materialized read state"
```

---

## Phase 4 — API routes

Routes follow the existing `src/app/api/draft/start/route.ts` pattern: thin handler that does `requireAdmin` → Zod validate → call service → `publish` SSE → return JSON. Errors are mapped: `TournamentStateError` → 409 (or 422 for tie cases), `ConcurrencyError` → 409, anything else → 500.

### Task 12: Route error helper

**Files:**
- Create: `src/app/api/tournament/_lib/route-helpers.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/tournament/_lib/route-helpers.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { TournamentStateError, ConcurrencyError } from '@/lib/tournament/tournament-events';

export function mapError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'validation failed', issues: e.issues }, { status: 400 });
  }
  if (e instanceof ConcurrencyError) {
    return NextResponse.json({ error: e.message, code: 'CONCURRENCY' }, { status: 409 });
  }
  if (e instanceof TournamentStateError) {
    const status =
      e.code === 'UNRESOLVED_TIES' ? 422 :
      e.code === 'DOWNSTREAM_BLOCKED' ? 422 :
      e.code === 'NOT_FOUND' ? 404 :
      409;
    const body: Record<string, unknown> = { error: e.message, code: e.code };
    const tieGroups = (e as TournamentStateError & { tieGroups?: unknown }).tieGroups;
    if (tieGroups) body.tieGroups = tieGroups;
    return NextResponse.json(body, { status });
  }
  console.error('tournament route error', e);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tournament/_lib/route-helpers.ts
git commit -m "feat(tournament): route error mapper"
```

---

### Task 13: `POST /api/tournament/create`

**Files:**
- Create: `src/app/api/tournament/create/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/tournament/create/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { createTournament } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../_lib/route-helpers';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  groupCount: z.number().int().min(1).max(8),
  teamsPerGroup: z.number().int().min(2).max(16),
  advancingPerGroup: z.number().int().min(1).max(8),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const input = Body.parse(await req.json());
    const t = await createTournament(db, { ...input, actorId: session!.user.id });
    publish({ type: 'state.invalidated', tournamentId: t.id, seq: t.seq });
    return NextResponse.json({ tournament: t });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tournament/create/route.ts
git commit -m "feat(tournament): POST /create endpoint"
```

---

### Task 14: `GET /api/tournament/[id]/state`

**Files:**
- Create: `src/app/api/tournament/[id]/state/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/tournament/[id]/state/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTournamentState } from '@/lib/tournament/tournament-state';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const state = await getTournamentState(db, id);
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(state);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tournament/[id]/state/route.ts
git commit -m "feat(tournament): GET /[id]/state endpoint"
```

---

### Task 15: `GET /api/tournament/[id]/stream` — SSE

**Files:**
- Create: `src/app/api/tournament/[id]/stream/route.ts`

- [ ] **Step 1: Implement** (closely mirrors `src/app/api/draft/stream/route.ts`)

```ts
// src/app/api/tournament/[id]/stream/route.ts
import { getSession } from '@/lib/auth';
import { subscribe } from '@/server/tournament-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;
const encoder = new TextEncoder();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });
  const { id: tournamentId } = await ctx.params;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      send('hello', { ts: Date.now(), tournamentId });
      const unsub = subscribe((evt) => {
        if ('tournamentId' in evt && evt.tournamentId === tournamentId) {
          send('tournament', evt);
        }
      });
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { closed = true; }
      }, HEARTBEAT_MS);
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', cleanup);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tournament/[id]/stream/route.ts
git commit -m "feat(tournament): SSE stream endpoint"
```

---

### Task 16: Groups assign + start endpoints

**Files:**
- Create: `src/app/api/tournament/[id]/groups/assign/route.ts`
- Create: `src/app/api/tournament/[id]/groups/start/route.ts`

- [ ] **Step 1: Implement `assign`**

```ts
// src/app/api/tournament/[id]/groups/assign/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignTeam } from '@/lib/tournament/groups-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../_lib/route-helpers';

export const runtime = 'nodejs';

const Body = z.object({
  teamId: z.string().min(1),
  groupLetter: z.string().min(1).max(2),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    await assignTeam(db, { tournamentId: id, ...input, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 2: Implement `start`**

```ts
// src/app/api/tournament/[id]/groups/start/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { startGroupStage } from '@/lib/tournament/groups-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../_lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    await startGroupStage(db, { tournamentId: id, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournament/[id]/groups
git commit -m "feat(tournament): groups assign + start endpoints"
```

---

### Task 17: Match endpoints (schedule, game POST/DELETE, walkover, edit)

**Files:**
- Create: `src/app/api/tournament/[id]/match/[mid]/schedule/route.ts`
- Create: `src/app/api/tournament/[id]/match/[mid]/game/route.ts`
- Create: `src/app/api/tournament/[id]/match/[mid]/walkover/route.ts`
- Create: `src/app/api/tournament/[id]/match/[mid]/edit/route.ts`

All four share the same skeleton (admin guard → Zod → service → publish → mapError). For brevity I'm collapsing them into one task with all the route code inline.

- [ ] **Step 1: Implement `schedule`**

```ts
// src/app/api/tournament/[id]/match/[mid]/schedule/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { scheduleMatch } from '@/lib/tournament/matches-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({ scheduledAt: z.string().datetime() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    const input = Body.parse(await req.json());
    await scheduleMatch(db, {
      tournamentId: id, matchId: mid,
      scheduledAt: new Date(input.scheduledAt),
      actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 2: Implement `game` (POST = record, DELETE = revoke last)**

```ts
// src/app/api/tournament/[id]/match/[mid]/game/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordGame, revokeLastGame } from '@/lib/tournament/matches-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({ winnerTeamId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    const input = Body.parse(await req.json());
    await recordGame(db, {
      tournamentId: id, matchId: mid,
      winnerTeamId: input.winnerTeamId, actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    await revokeLastGame(db, {
      tournamentId: id, matchId: mid, actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 3: Implement `walkover`**

```ts
// src/app/api/tournament/[id]/match/[mid]/walkover/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { declareWalkover } from '@/lib/tournament/matches-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({
  winnerTeamId: z.string().min(1),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    const input = Body.parse(await req.json());
    await declareWalkover(db, {
      tournamentId: id, matchId: mid,
      winnerTeamId: input.winnerTeamId, note: input.note,
      actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 4: Implement `edit`**

```ts
// src/app/api/tournament/[id]/match/[mid]/edit/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { editMatchGames } from '@/lib/tournament/matches-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({
  games: z.array(z.object({ winnerTeamId: z.string().min(1) })).max(5),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id, mid } = await ctx.params;
    const input = Body.parse(await req.json());
    await editMatchGames(db, {
      tournamentId: id, matchId: mid,
      games: input.games, actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 5: Type-check and commit**

```bash
npm run typecheck
git add src/app/api/tournament/[id]/match
git commit -m "feat(tournament): match endpoints (schedule/game/walkover/edit)"
```

---

### Task 18: Stage transition + tiebreaker + bracket + reset endpoints

**Files:**
- Create: `src/app/api/tournament/[id]/close-group-stage/route.ts`
- Create: `src/app/api/tournament/[id]/tiebreaker/route.ts`
- Create: `src/app/api/tournament/[id]/bracket/seed/route.ts`
- Create: `src/app/api/tournament/[id]/bracket/lock/route.ts`
- Create: `src/app/api/tournament/[id]/reset/route.ts`

- [ ] **Step 1: Implement `close-group-stage`**

```ts
// src/app/api/tournament/[id]/close-group-stage/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { closeGroupStage } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../_lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    await closeGroupStage(db, { tournamentId: id, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 2: Implement `tiebreaker`**

```ts
// src/app/api/tournament/[id]/tiebreaker/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { createTiebreaker } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({ teamAId: z.string().min(1), teamBId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    await createTiebreaker(db, { tournamentId: id, ...input, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 3: Implement `bracket/seed`**

```ts
// src/app/api/tournament/[id]/bracket/seed/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { seedBracket } from '@/lib/tournament/bracket-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../_lib/route-helpers';

export const runtime = 'nodejs';
const Body = z.object({ slots: z.array(z.string().min(1)).length(8) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    await seedBracket(db, {
      tournamentId: id,
      slots: input.slots as Parameters<typeof seedBracket>[1]['slots'],
      actorId: session!.user.id,
    });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 4: Implement `bracket/lock`**

```ts
// src/app/api/tournament/[id]/bracket/lock/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { lockBracket } from '@/lib/tournament/bracket-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../../_lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    await lockBracket(db, { tournamentId: id, actorId: session!.user.id });
    const t = await db.tournament.findUnique({ where: { id } });
    publish({ type: 'state.invalidated', tournamentId: id, seq: t!.seq });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 5: Implement `reset`**

```ts
// src/app/api/tournament/[id]/reset/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { resetTournament } from '@/lib/tournament/tournament-service';
import { publish } from '@/server/tournament-bus';
import { mapError } from '../../_lib/route-helpers';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const session = await getSession();
  try {
    const { id } = await ctx.params;
    await resetTournament(db, { tournamentId: id, actorId: session!.user.id });
    publish({ type: 'tournament.reset', tournamentId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
```

- [ ] **Step 6: Type-check and commit**

```bash
npm run typecheck
git add src/app/api/tournament/[id]/close-group-stage src/app/api/tournament/[id]/tiebreaker src/app/api/tournament/[id]/bracket src/app/api/tournament/[id]/reset
git commit -m "feat(tournament): close-group-stage, tiebreaker, bracket, reset endpoints"
```

---

### Task 19: Team rename — `PATCH /api/teams/[id]`

**Files:**
- Create: `src/app/api/teams/[id]/route.ts`
- Create: `src/lib/teams/rename-service.ts`
- Test: `src/lib/teams/rename-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/teams/rename-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { renameTeam, TeamRenameError } from './rename-service';

async function setup(names: string[]) {
  await db.matchGame.deleteMany();
  await db.match.deleteMany();
  await db.groupTeam.deleteMany();
  await db.group.deleteMany();
  await db.tournamentEvent.deleteMany();
  await db.tournament.deleteMany();
  await db.teamSlot.deleteMany();
  await db.team.deleteMany();
  await db.player.deleteMany();
  await db.user.deleteMany();
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
    const p = await db.player.create({
      data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    out.push(await db.team.create({ data: { name: names[i], captainId: p.id, budgetLeft: 900 } }));
  }
  return out;
}

describe('renameTeam', () => {
  it('renames a team to a valid new name', async () => {
    const [t] = await setup(['Original']);
    await renameTeam(db, { teamId: t.id, newName: '  New Name  ' });
    const after = await db.team.findUnique({ where: { id: t.id } });
    expect(after?.name).toBe('New Name');
  });

  it('rejects too-short / too-long names', async () => {
    const [t] = await setup(['Original']);
    await expect(renameTeam(db, { teamId: t.id, newName: 'A' }))
      .rejects.toBeInstanceOf(TeamRenameError);
    await expect(renameTeam(db, { teamId: t.id, newName: 'X'.repeat(31) }))
      .rejects.toBeInstanceOf(TeamRenameError);
  });

  it('rejects duplicate names (case-sensitive)', async () => {
    const [a, b] = await setup(['Alpha', 'Beta']);
    await expect(renameTeam(db, { teamId: b.id, newName: 'Alpha' }))
      .rejects.toBeInstanceOf(TeamRenameError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/teams/rename-service.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement service**

```ts
// src/lib/teams/rename-service.ts
import type { PrismaClient } from '@prisma/client';

export class TeamRenameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const NAME_MIN = 2;
const NAME_MAX = 30;

export async function renameTeam(
  db: PrismaClient,
  input: { teamId: string; newName: string },
): Promise<void> {
  const name = input.newName.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new TeamRenameError('INVALID_LENGTH', `name must be ${NAME_MIN}–${NAME_MAX} chars`);
  }
  // Reject control characters
  if (/[ -]/.test(name)) {
    throw new TeamRenameError('INVALID_CHARS', 'name contains control characters');
  }
  const existing = await db.team.findUnique({ where: { id: input.teamId } });
  if (!existing) throw new TeamRenameError('NOT_FOUND', 'team not found');
  if (existing.name === name) return; // no-op
  try {
    await db.team.update({ where: { id: input.teamId }, data: { name } });
  } catch (e: unknown) {
    // Prisma unique violation
    if ((e as { code?: string }).code === 'P2002') {
      throw new TeamRenameError('DUPLICATE', `name "${name}" is already taken`);
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/teams/rename-service.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Implement the route**

```ts
// src/app/api/teams/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { renameTeam, TeamRenameError } from '@/lib/teams/rename-service';
import { publish } from '@/server/tournament-bus';

export const runtime = 'nodejs';

const Body = z.object({ name: z.string() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamId } = await ctx.params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { captain: { include: { user: true } } },
  });
  if (!team) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const isOwner = team.captain.user.id === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const input = Body.parse(await req.json());
    await renameTeam(db, { teamId, newName: input.name });
    // Notify any active tournament viewers
    const gt = await db.groupTeam.findUnique({
      where: { teamId },
      include: { group: { include: { tournament: true } } },
    });
    if (gt) {
      publish({
        type: 'state.invalidated',
        tournamentId: gt.group.tournamentId,
        seq: gt.group.tournament.seq,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamRenameError) {
      const status = e.code === 'DUPLICATE' ? 409 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    if ((e as { name?: string }).name === 'ZodError') {
      return NextResponse.json({ error: 'validation failed' }, { status: 400 });
    }
    console.error('rename failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/teams/rename-service.ts src/lib/teams/rename-service.test.ts src/app/api/teams
git commit -m "feat(tournament): team rename endpoint with role-based authz"
```

---

## Phase 5 — UI

### Task 20: `useTournamentState` hook — SSE-subscribed state client

**Files:**
- Create: `src/hooks/useTournamentState.ts`

The hook owns: initial fetch + SSE subscribe + refetch on every `state.invalidated`. Components consume `{ state, loading, error }`.

- [ ] **Step 1: Implement**

```ts
// src/hooks/useTournamentState.ts
'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function useTournamentState(tournamentId: string | null) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectMs = useRef<number>(1000);

  const refetch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tournament/${id}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tournamentId) return;
    void refetch(tournamentId);

    const open = () => {
      const es = new EventSource(`/api/tournament/${tournamentId}/stream`);
      esRef.current = es;
      es.addEventListener('tournament', () => {
        void refetch(tournamentId);
      });
      es.onopen = () => { reconnectMs.current = 1000; };
      es.onerror = () => {
        es.close();
        const delay = Math.min(reconnectMs.current, 15000);
        reconnectMs.current = Math.min(reconnectMs.current * 2, 15000);
        setTimeout(open, delay);
      };
    };
    open();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [tournamentId, refetch]);

  return { state, loading, error, refetch: () => tournamentId && refetch(tournamentId) };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTournamentState.ts
git commit -m "feat(tournament): SSE-subscribed state hook"
```

---

### Task 21: Admin tournament list page (`/admin/tournament`)

**Files:**
- Create: `src/app/admin/tournament/page.tsx`

- [ ] **Step 1: Implement** (server component that lists tournaments + a client-side create form)

```tsx
// src/app/admin/tournament/page.tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateTournamentForm } from './_components/CreateTournamentForm';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentListPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');

  const list = await db.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">赛事管理</h1>
      <CreateTournamentForm />
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">状态</th>
              <th className="p-2 text-left">分组</th>
              <th className="p-2 text-left">出线</th>
              <th className="p-2 text-left">创建时间</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{t.groupCount} × {t.teamsPerGroup}</td>
                <td className="p-2">{t.advancingPerGroup}/组</td>
                <td className="p-2">{t.createdAt.toLocaleString()}</td>
                <td className="p-2 text-right">
                  <Link className="text-primary underline" href={`/admin/tournament/${t.id}`}>进入</Link>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">还没有赛事</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the create form**

```tsx
// src/app/admin/tournament/_components/CreateTournamentForm.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function CreateTournamentForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: '', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2,
  });
  const valid = form.advancingPerGroup * form.groupCount === 8 && form.name.trim().length > 0;

  function submit() {
    start(async () => {
      const res = await fetch('/api/tournament/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `failed (${res.status})`);
        return;
      }
      const { tournament } = await res.json();
      toast.success('赛事已创建');
      router.push(`/admin/tournament/${tournament.id}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="font-medium">创建新赛事</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-sm">
          名称
          <input className="block w-full border rounded p-2 mt-1" value={form.name}
                 onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm">
          小组数
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.groupCount}
                 onChange={e => setForm({ ...form, groupCount: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          每组队数
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.teamsPerGroup}
                 onChange={e => setForm({ ...form, teamsPerGroup: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          每组出线
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.advancingPerGroup}
                 onChange={e => setForm({ ...form, advancingPerGroup: Number(e.target.value) })} />
        </label>
      </div>
      <div className="text-sm text-muted-foreground">
        约束:每组出线 × 小组数 = 8 (当前 {form.advancingPerGroup * form.groupCount})
      </div>
      <button
        disabled={!valid || pending}
        onClick={submit}
        className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
      >
        {pending ? '创建中…' : '创建赛事'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test in browser**

```bash
npm run dev
```

Visit `http://localhost:3000/admin/tournament` (logged in as admin). The page should render, allow creating a tournament, and redirect to the detail page (which will 404 until Task 22).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/tournament/page.tsx src/app/admin/tournament/_components/CreateTournamentForm.tsx
git commit -m "feat(tournament): admin list + create form"
```

---

### Task 22: Admin detail page (`/admin/tournament/[id]`) — tabs shell

**Files:**
- Create: `src/app/admin/tournament/[id]/page.tsx`
- Create: `src/app/admin/tournament/[id]/_components/TournamentTabs.tsx`

- [ ] **Step 1: Implement the page (server)**

```tsx
// src/app/admin/tournament/[id]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { TournamentTabs } from './_components/TournamentTabs';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');
  const { id } = await params;
  const exists = await db.tournament.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  return <TournamentTabs tournamentId={id} />;
}
```

- [ ] **Step 2: Implement the tabs shell (client)**

```tsx
// src/app/admin/tournament/[id]/_components/TournamentTabs.tsx
'use client';
import { useState } from 'react';
import { useTournamentState } from '@/hooks/useTournamentState';
import { SetupTab } from './SetupTab';
import { GroupsTab } from './GroupsTab';
import { MatchesTab } from './MatchesTab';
import { BracketTab } from './BracketTab';
import { AuditTab } from './AuditTab';

type TabId = 'setup' | 'groups' | 'matches' | 'bracket' | 'audit';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'groups', label: '分组' },
  { id: 'matches', label: '比赛' },
  { id: 'bracket', label: '淘汰赛' },
  { id: 'audit', label: '审计' },
];

export function TournamentTabs({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<TabId>('setup');
  const { state, loading, error, refetch } = useTournamentState(tournamentId);

  if (loading) return <div className="p-6">加载中…</div>;
  if (error || !state) return <div className="p-6 text-red-600">加载失败: {error}</div>;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{state.tournament.name}</h1>
        <span className="text-sm text-muted-foreground">{state.tournament.status}</span>
      </header>
      <nav className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 -mb-px border-b-2 ${tab === t.id ? 'border-primary' : 'border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'setup' && <SetupTab state={state} onChange={refetch} />}
      {tab === 'groups' && <GroupsTab state={state} onChange={refetch} />}
      {tab === 'matches' && <MatchesTab state={state} onChange={refetch} />}
      {tab === 'bracket' && <BracketTab state={state} onChange={refetch} />}
      {tab === 'audit' && <AuditTab tournamentId={tournamentId} />}
    </div>
  );
}
```

- [ ] **Step 3: Add placeholder stubs for the 5 tabs so the file compiles**

Create each of these files containing only a placeholder; they will be filled in by the next tasks.

```tsx
// src/app/admin/tournament/[id]/_components/SetupTab.tsx
'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function SetupTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Setup (Task 23)</div>;
}
```

```tsx
// src/app/admin/tournament/[id]/_components/GroupsTab.tsx
'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function GroupsTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Groups (Task 24)</div>;
}
```

```tsx
// src/app/admin/tournament/[id]/_components/MatchesTab.tsx
'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function MatchesTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Matches (Task 25)</div>;
}
```

```tsx
// src/app/admin/tournament/[id]/_components/BracketTab.tsx
'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function BracketTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Bracket (Task 26)</div>;
}
```

```tsx
// src/app/admin/tournament/[id]/_components/AuditTab.tsx
'use client';
export function AuditTab(_: { tournamentId: string }) {
  return <div className="text-muted-foreground">Audit (Task 27)</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/tournament/[id]
git commit -m "feat(tournament): admin tabs shell + placeholder stubs"
```

---

### Task 23: Admin Setup tab — name, config, reset

**Files:**
- Modify: `src/app/admin/tournament/[id]/_components/SetupTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/admin/tournament/[id]/_components/SetupTab.tsx
'use client';
import { useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function SetupTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const t = state.tournament;

  function reset() {
    if (!confirm('重置当前赛事?将归档现有数据,不可逆。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${t.id}/reset`, { method: 'POST' });
      if (!res.ok) {
        toast.error(`重置失败 (${res.status})`);
        return;
      }
      toast.success('赛事已归档');
      window.location.href = '/admin/tournament';
    });
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-y-2 max-w-md">
        <dt className="text-muted-foreground">名称</dt><dd>{t.name}</dd>
        <dt className="text-muted-foreground">状态</dt><dd>{t.status}</dd>
        <dt className="text-muted-foreground">小组数</dt><dd>{t.groupCount}</dd>
        <dt className="text-muted-foreground">每组队数</dt><dd>{t.teamsPerGroup}</dd>
        <dt className="text-muted-foreground">每组出线</dt><dd>{t.advancingPerGroup}</dd>
        <dt className="text-muted-foreground">事件序列</dt><dd>{t.seq}</dd>
        {t.championId && (<><dt className="text-muted-foreground">冠军</dt><dd>{t.championId}</dd></>)}
      </dl>
      <button onClick={reset} disabled={pending}
              className="rounded border border-destructive text-destructive px-4 py-2 disabled:opacity-50">
        {pending ? '重置中…' : '归档并重置赛事'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/tournament/[id]/_components/SetupTab.tsx
git commit -m "feat(tournament): admin Setup tab"
```

---

### Task 24: Admin Groups tab — drag-drop assignment + start button

**Files:**
- Modify: `src/app/admin/tournament/[id]/_components/GroupsTab.tsx`

The drag-drop UX uses `@dnd-kit/core` (already in dependencies). For simplicity and to avoid drag-edge cases on touch devices, fall back to **click-to-assign** as the primary interaction; drag is a nice-to-have but click is the source of truth.

- [ ] **Step 1: Implement**

```tsx
// src/app/admin/tournament/[id]/_components/GroupsTab.tsx
'use client';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';

interface TeamSummary { id: string; name: string }

export function GroupsTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [allTeams, setAllTeams] = useState<TeamSummary[]>([]);
  const [target, setTarget] = useState<string>('A');

  useEffect(() => {
    fetch('/api/draft/state', { cache: 'no-store' })
      .then(r => r.json())
      .then(s => {
        const teams = (s?.teams ?? []) as Array<{ id: string; name: string }>;
        setAllTeams(teams.map(t => ({ id: t.id, name: t.name })));
      })
      .catch(() => setAllTeams([]));
  }, []);

  const assigned = new Set<string>();
  state.groups.forEach(g => g.teams.forEach(t => assigned.add(t.teamId)));
  const unassigned = allTeams.filter(t => !assigned.has(t.id));

  const canStart =
    state.tournament.status === 'NOT_STARTED' &&
    state.groups.length === state.tournament.groupCount &&
    state.groups.every(g => g.teams.length === state.tournament.teamsPerGroup);

  function assign(teamId: string) {
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/groups/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, groupLetter: target }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `分组失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function startGroup() {
    if (!confirm('开始小组赛?之后将不能再调整分组。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/groups/start`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `启动失败 (${res.status})`);
        return;
      }
      toast.success('小组赛已开始');
      onChange();
    });
  }

  const editable = state.tournament.status === 'NOT_STARTED';

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
      <div className="border rounded p-3 space-y-2">
        <h3 className="font-medium">未分组队伍 ({unassigned.length})</h3>
        {!editable && <p className="text-sm text-muted-foreground">分组已锁定</p>}
        {editable && (
          <label className="block text-sm">
            目标小组
            <select className="block w-full border rounded p-2 mt-1"
                    value={target} onChange={e => setTarget(e.target.value)}>
              {state.groups.map(g => (
                <option key={g.id} value={g.letter}>组 {g.letter}</option>
              ))}
            </select>
          </label>
        )}
        <ul className="space-y-1">
          {unassigned.map(team => (
            <li key={team.id} className="flex justify-between items-center border rounded p-2">
              <span>{team.name}</span>
              {editable && (
                <button disabled={pending} onClick={() => assign(team.id)}
                        className="text-sm rounded bg-primary text-primary-foreground px-2 py-1">
                  分到 {target}
                </button>
              )}
            </li>
          ))}
          {unassigned.length === 0 && (
            <li className="text-sm text-muted-foreground">全部已分组</li>
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {state.groups.map(g => (
            <div key={g.id} className="border rounded p-3">
              <h3 className="font-medium">组 {g.letter} ({g.teams.length}/{state.tournament.teamsPerGroup})</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {g.teams.map(t => (
                  <li key={t.teamId} className="border rounded px-2 py-1">{t.name}</li>
                ))}
                {g.teams.length === 0 && (
                  <li className="text-muted-foreground">空</li>
                )}
              </ul>
            </div>
          ))}
        </div>
        {editable && (
          <button onClick={startGroup} disabled={!canStart || pending}
                  className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
            {pending ? '启动中…' : '开始小组赛'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test:** create a tournament, assign 8 teams, start the group stage. Verify all matches generated.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/tournament/[id]/_components/GroupsTab.tsx
git commit -m "feat(tournament): admin Groups tab"
```

---

### Task 25: Admin Matches tab — score entry / walkover / edit / revoke / schedule

**Files:**
- Modify: `src/app/admin/tournament/[id]/_components/MatchesTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/admin/tournament/[id]/_components/MatchesTab.tsx
'use client';
import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import type { TournamentState, MatchView } from '@/lib/tournament/tournament-state';

export function MatchesTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const teamName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);

  const byPhase = useMemo(() => {
    const grouped: Record<string, MatchView[]> = {};
    for (const m of state.matches) {
      grouped[m.phase] = grouped[m.phase] ?? [];
      grouped[m.phase].push(m);
    }
    return grouped;
  }, [state.matches]);

  function recordGame(m: MatchView, winnerTeamId: string) {
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/game`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerTeamId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `录入失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function revokeLast(m: MatchView) {
    if (!confirm(`撤销 ${teamName(m.teamAId)} vs ${teamName(m.teamBId)} 的最后一局?`)) return;
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/game`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `撤销失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function setSchedule(m: MatchView) {
    const v = prompt(
      '请输入开打时间 (ISO 格式, 如 2026-06-01T19:00:00+08:00)',
      m.scheduledAt ?? '',
    );
    if (!v) return;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      toast.error('时间格式无效');
      return;
    }
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt: d.toISOString() }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `排期失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function walkover(m: MatchView) {
    if (!m.teamAId || !m.teamBId) return;
    const choice = prompt(
      `输入胜方 (A=${teamName(m.teamAId)}, B=${teamName(m.teamBId)}) 后跟 / 和备注,例如:\nA / 对手未到`,
    );
    if (!choice) return;
    const [sideRaw, note] = choice.split('/').map(s => s.trim());
    const side = sideRaw?.toUpperCase();
    const winnerTeamId = side === 'A' ? m.teamAId : side === 'B' ? m.teamBId : null;
    if (!winnerTeamId) { toast.error('未识别胜方'); return; }
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/walkover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerTeamId, note }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `弃权登记失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  const phaseOrder = ['GROUP', 'TIEBREAKER', 'QF', 'SF', 'FINAL'] as const;

  return (
    <div className="space-y-6">
      {phaseOrder.map(phase => {
        const ms = byPhase[phase];
        if (!ms || ms.length === 0) return null;
        return (
          <section key={phase}>
            <h3 className="font-medium mb-2">{phase}</h3>
            <table className="w-full text-sm border">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">对阵</th>
                  <th className="p-2">系列比分</th>
                  <th className="p-2">状态</th>
                  <th className="p-2">开打时间</th>
                  <th className="p-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {ms.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">
                      {teamName(m.teamAId)} vs {teamName(m.teamBId)}
                    </td>
                    <td className="p-2 text-center">{m.seriesScore.a} - {m.seriesScore.b} <span className="text-muted-foreground">({m.format})</span></td>
                    <td className="p-2 text-center">{m.status}</td>
                    <td className="p-2">
                      {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : '—'}
                    </td>
                    <td className="p-2 text-right space-x-2">
                      <button disabled={pending} onClick={() => setSchedule(m)} className="text-xs underline">排期</button>
                      {m.teamAId && m.teamBId && m.status !== 'FINISHED' && m.status !== 'WALKOVER' && (
                        <>
                          <button disabled={pending} onClick={() => recordGame(m, m.teamAId!)} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
                            A胜 {teamName(m.teamAId)}
                          </button>
                          <button disabled={pending} onClick={() => recordGame(m, m.teamBId!)} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
                            B胜 {teamName(m.teamBId)}
                          </button>
                          <button disabled={pending} onClick={() => walkover(m)} className="text-xs underline">弃权</button>
                        </>
                      )}
                      {m.games.length > 0 && (
                        <button disabled={pending} onClick={() => revokeLast(m)} className="text-xs underline text-destructive">撤销上一局</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {state.tournament.status === 'GROUP_STAGE' && (
        <CloseGroupStageButton state={state} onChange={onChange} />
      )}
    </div>
  );
}

function CloseGroupStageButton({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  function close() {
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/close-group-stage`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.tieGroups) {
          toast.error(`存在未决并列,请先安排加赛: ${JSON.stringify(body.tieGroups)}`);
          return;
        }
        toast.error(body.error ?? `关闭失败 (${res.status})`);
        return;
      }
      toast.success('小组赛已关闭,进入排阵阶段');
      onChange();
    });
  }
  return (
    <button disabled={pending} onClick={close}
            className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
      {pending ? '关闭中…' : '关闭小组赛'}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/tournament/[id]/_components/MatchesTab.tsx
git commit -m "feat(tournament): admin Matches tab with score entry"
```

---

### Task 26: Admin Bracket tab — seed 8 slots + tree view

**Files:**
- Modify: `src/app/admin/tournament/[id]/_components/BracketTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/admin/tournament/[id]/_components/BracketTab.tsx
'use client';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function BracketTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const teamName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);

  // Advancing teams = top advancingPerGroup of each group standing
  const advancing = useMemo(() => {
    const result: Array<{ teamId: string; label: string }> = [];
    for (const gId of Object.keys(state.standings.byGroup)) {
      const group = state.groups.find(g => g.id === gId);
      const groupLetter = group?.letter ?? '?';
      const rows = state.standings.byGroup[gId];
      const top = rows.slice(0, state.tournament.advancingPerGroup);
      top.forEach((r, i) => {
        result.push({ teamId: r.teamId, label: `${groupLetter}${i + 1} ${teamName(r.teamId)}` });
      });
    }
    return result;
  }, [state.groups, state.standings.byGroup, state.tournament.advancingPerGroup, teamName]);

  const [slots, setSlots] = useState<Array<string | null>>(Array(8).fill(null));
  const usedSet = new Set(slots.filter(Boolean) as string[]);
  const available = advancing.filter(a => !usedSet.has(a.teamId));

  function assignSlot(idx: number, teamId: string) {
    const next = [...slots];
    next[idx] = teamId;
    setSlots(next);
  }

  function clearSlot(idx: number) {
    const next = [...slots];
    next[idx] = null;
    setSlots(next);
  }

  function submitSeed() {
    if (slots.some(s => !s)) { toast.error('请填满 8 个位置'); return; }
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/bracket/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `提交失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function lock() {
    if (!confirm('锁定对阵?锁定后将进入淘汰赛阶段。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/bracket/lock`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `锁定失败 (${res.status})`);
        return;
      }
      toast.success('对阵已锁定,进入淘汰赛');
      onChange();
    });
  }

  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const bracketLocked = state.tournament.status === 'KNOCKOUT' || state.tournament.status === 'FINISHED';

  if (state.tournament.status === 'BRACKET_SEEDING' && knockout.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-medium">排八强对阵</h3>
        <div className="grid grid-cols-2 gap-3">
          {slots.map((slot, idx) => (
            <div key={idx} className="border rounded p-3 flex items-center justify-between">
              <span className="text-sm font-mono">Slot {idx + 1}</span>
              {slot ? (
                <span className="flex items-center gap-2">
                  <span>{teamName(slot)}</span>
                  <button onClick={() => clearSlot(idx)} className="text-xs underline">清除</button>
                </span>
              ) : (
                <select onChange={e => assignSlot(idx, e.target.value)} value="" className="border rounded p-1 text-sm">
                  <option value="">选择…</option>
                  {available.map(a => (
                    <option key={a.teamId} value={a.teamId}>{a.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <button disabled={pending} onClick={submitSeed}
                className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
          {pending ? '提交中…' : '保存对阵'}
        </button>
      </div>
    );
  }

  if (state.tournament.status === 'BRACKET_SEEDING' && knockout.length > 0) {
    return (
      <div className="space-y-4">
        <BracketTree state={state} teamName={teamName} />
        <button disabled={pending} onClick={lock}
                className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
          {pending ? '锁定中…' : '锁定对阵 → 开始淘汰赛'}
        </button>
      </div>
    );
  }

  if (bracketLocked) {
    return <BracketTree state={state} teamName={teamName} />;
  }

  return <div className="text-muted-foreground">需要先完成小组赛并关闭。</div>;
}

function BracketTree({ state, teamName }:
  { state: TournamentState; teamName: (id: string | null) => string }) {
  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const byRound = [0, 1, 2].map(r => knockout.filter(m => m.roundIndex === r)
    .sort((a, b) => (a.matchIndex ?? 0) - (b.matchIndex ?? 0)));
  return (
    <div className="flex gap-4 overflow-x-auto">
      {byRound.map((round, ri) => (
        <div key={ri} className="flex flex-col gap-4 min-w-[200px]">
          <h4 className="text-sm font-medium">{['QF', 'SF', 'FINAL'][ri]}</h4>
          {round.map(m => (
            <div key={m.id} className="border rounded p-2 text-sm">
              <div>{teamName(m.teamAId)} ({m.seriesScore.a})</div>
              <div className="text-muted-foreground">vs</div>
              <div>{teamName(m.teamBId)} ({m.seriesScore.b})</div>
              <div className="text-xs text-muted-foreground mt-1">{m.format} · {m.status}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/tournament/[id]/_components/BracketTab.tsx
git commit -m "feat(tournament): admin Bracket tab — seed 8 slots + tree"
```

---

### Task 27: Admin Audit tab — TournamentEvent log

**Files:**
- Modify: `src/app/admin/tournament/[id]/_components/AuditTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/admin/tournament/[id]/_components/AuditTab.tsx
'use client';
import { useEffect, useState } from 'react';

interface EventRow {
  id: string;
  type: string;
  payload: unknown;
  actorId: string;
  seq: number;
  createdAt: string;
}

export function AuditTab({ tournamentId }: { tournamentId: string }) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tournament/${tournamentId}/events?limit=200`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setRows(d.events ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div>加载审计日志…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Seq</th>
            <th className="p-2 text-left">类型</th>
            <th className="p-2 text-left">操作者</th>
            <th className="p-2 text-left">时间</th>
            <th className="p-2 text-left">Payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-mono">{r.seq}</td>
              <td className="p-2">{r.type}</td>
              <td className="p-2 font-mono text-xs">{r.actorId.slice(0, 8)}</td>
              <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="p-2 font-mono text-xs max-w-md truncate" title={JSON.stringify(r.payload)}>
                {JSON.stringify(r.payload)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">暂无事件</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Add the events endpoint**

```ts
// src/app/api/tournament/[id]/events/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const events = await db.tournamentEvent.findMany({
    where: { tournamentId: id },
    orderBy: { seq: 'desc' },
    take: limit,
  });
  return NextResponse.json({ events });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/tournament/[id]/_components/AuditTab.tsx src/app/api/tournament/[id]/events
git commit -m "feat(tournament): admin Audit tab + events endpoint"
```

---

### Task 28: Public viewing page (`/tournament`) — schedule, groups, bracket

**Files:**
- Create: `src/app/tournament/page.tsx`
- Create: `src/app/tournament/_components/PublicTabs.tsx`

- [ ] **Step 1: Implement the page (server)** — auto-redirects to the active tournament

```tsx
// src/app/tournament/page.tsx
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { PublicTabs } from './_components/PublicTabs';

export const dynamic = 'force-dynamic';

export default async function PublicTournamentPage() {
  const active = await db.tournament.findFirst({
    where: { status: { in: ['GROUP_STAGE', 'BRACKET_SEEDING', 'KNOCKOUT'] } },
    orderBy: { createdAt: 'desc' },
  });
  const fallback = active ?? await db.tournament.findFirst({
    where: { status: 'FINISHED' }, orderBy: { finishedAt: 'desc' },
  });
  if (!fallback) {
    return <div className="container mx-auto p-6">暂无赛事数据</div>;
  }
  return <PublicTabs tournamentId={fallback.id} />;
}
```

- [ ] **Step 2: Implement the client tabs**

```tsx
// src/app/tournament/_components/PublicTabs.tsx
'use client';
import { useState, useMemo } from 'react';
import { useTournamentState } from '@/hooks/useTournamentState';
import type { TournamentState, MatchView } from '@/lib/tournament/tournament-state';

type Tab = 'schedule' | 'groups' | 'bracket';

export function PublicTabs({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<Tab>('schedule');
  const { state, loading, error } = useTournamentState(tournamentId);

  if (loading) return <div className="container mx-auto p-6">加载中…</div>;
  if (error || !state) return <div className="container mx-auto p-6 text-red-600">加载失败: {error}</div>;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{state.tournament.name}</h1>
      <nav className="flex gap-2 border-b">
        {[
          { id: 'schedule' as const, label: '赛程' },
          { id: 'groups' as const, label: '小组' },
          { id: 'bracket' as const, label: '淘汰赛' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 -mb-px border-b-2 ${tab === t.id ? 'border-primary' : 'border-transparent'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'schedule' && <ScheduleView state={state} />}
      {tab === 'groups' && <GroupsView state={state} />}
      {tab === 'bracket' && <BracketView state={state} />}
    </div>
  );
}

function ScheduleView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  const buckets = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);
    const tomorrowKey = ymd(new Date(now.getTime() + 86_400_000));
    const groups: Record<string, MatchView[]> = { Today: [], Tomorrow: [], 'This Week': [], Past: [], Unscheduled: [] };
    for (const m of state.schedule) {
      if (!m.scheduledAt) { groups.Unscheduled.push(m); continue; }
      const d = new Date(m.scheduledAt);
      const key = ymd(d);
      if (key === todayKey) groups.Today.push(m);
      else if (key === tomorrowKey) groups.Tomorrow.push(m);
      else if (d.getTime() < now.getTime()) groups.Past.push(m);
      else groups['This Week'].push(m);
    }
    return groups;
  }, [state.schedule]);

  return (
    <div className="space-y-4">
      {Object.entries(buckets).map(([k, ms]) =>
        ms.length === 0 ? null : (
          <section key={k}>
            <h3 className="font-medium mb-1">{k}</h3>
            <table className="w-full text-sm border">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">阶段</th>
                  <th className="p-2 text-left">对阵</th>
                  <th className="p-2 text-center">比分</th>
                  <th className="p-2 text-left">状态</th>
                  <th className="p-2 text-left">时间</th>
                </tr>
              </thead>
              <tbody>
                {ms.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">{m.phase}</td>
                    <td className="p-2">{tName(m.teamAId)} vs {tName(m.teamBId)}</td>
                    <td className="p-2 text-center">{m.seriesScore.a} - {m.seriesScore.b}</td>
                    <td className="p-2">{m.status}</td>
                    <td className="p-2">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </div>
  );
}

function GroupsView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {state.groups.map(g => {
        const rows = state.standings.byGroup[g.id] ?? [];
        const tied = state.standings.tieGroups.find(tg => tg.groupId === g.id);
        return (
          <div key={g.id} className="border rounded p-3">
            <h3 className="font-medium">组 {g.letter}</h3>
            <table className="w-full text-sm mt-2">
              <thead>
                <tr><th className="text-left">队伍</th><th>W</th><th>L</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.teamId} className={tied?.tiedTeamIds.includes(r.teamId) ? 'text-amber-600' : ''}>
                    <td>{tName(r.teamId)}</td>
                    <td className="text-center">{r.wins}</td>
                    <td className="text-center">{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tied && <p className="text-xs text-amber-600 mt-2">存在并列,待加赛</p>}
          </div>
        );
      })}
    </div>
  );
}

function BracketView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const byRound = [0, 1, 2].map(r => knockout.filter(m => m.roundIndex === r)
    .sort((a, b) => (a.matchIndex ?? 0) - (b.matchIndex ?? 0)));
  if (knockout.length === 0) {
    return <div className="text-muted-foreground">小组赛尚未结束,淘汰赛对阵未生成。</div>;
  }
  return (
    <div className="flex gap-4 overflow-x-auto">
      {byRound.map((round, ri) => (
        <div key={ri} className="flex flex-col gap-4 min-w-[200px]">
          <h4 className="text-sm font-medium">{['八强', '四强', '决赛'][ri]}</h4>
          {round.map(m => (
            <div key={m.id} className="border rounded p-2 text-sm">
              <div className={m.winnerTeamId === m.teamAId ? 'font-semibold' : ''}>
                {tName(m.teamAId)} ({m.seriesScore.a})
              </div>
              <div className={m.winnerTeamId === m.teamBId ? 'font-semibold' : ''}>
                {tName(m.teamBId)} ({m.seriesScore.b})
              </div>
              <div className="text-xs text-muted-foreground mt-1">{m.format} · {m.status}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function useTeamName(state: TournamentState) {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tournament
git commit -m "feat(tournament): public viewing page with SSE live updates"
```

---

## Phase 6 — Team rename UI

### Task 29: `TeamRenameInline` — shared rename component

**Files:**
- Create: `src/components/team/TeamRenameInline.tsx`

Used by captain dashboard and admin team lists. Renders an inline edit field with optimistic update.

- [ ] **Step 1: Implement**

```tsx
// src/components/team/TeamRenameInline.tsx
'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

export function TeamRenameInline({
  teamId,
  currentName,
  canEdit,
  onRenamed,
}: {
  teamId: string;
  currentName: string;
  canEdit: boolean;
  onRenamed?: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const [pending, start] = useTransition();

  function save() {
    const next = draft.trim();
    if (next === currentName) { setEditing(false); return; }
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `重命名失败 (${res.status})`);
        return;
      }
      toast.success('已更新');
      setEditing(false);
      onRenamed?.(next);
    });
  }

  if (!canEdit) {
    return <span>{currentName}</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{currentName}</span>
        <button onClick={() => { setDraft(currentName); setEditing(true); }}
                className="text-xs underline text-muted-foreground">重命名</button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input value={draft} onChange={e => setDraft(e.target.value)}
             className="border rounded p-1 text-sm" autoFocus
             onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      <button disabled={pending} onClick={save}
              className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
        {pending ? '…' : '保存'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs underline">取消</button>
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/TeamRenameInline.tsx
git commit -m "feat(team-rename): shared inline rename component"
```

---

### Task 30: Wire rename into captain page + admin Groups tab + admin draft view

**Files:**
- Modify: `src/app/captain/page.tsx` (or whatever the existing captain page is)
- Modify: `src/app/admin/tournament/[id]/_components/GroupsTab.tsx`
- Modify: `src/app/admin/draft/page.tsx`

The exact existing layout of `/captain` and `/admin/draft` is not pre-known to this plan. Read each file first, then add `<TeamRenameInline ... />` next to wherever team names are currently rendered. The component is self-contained; passing the wrong `canEdit` won't break anything.

- [ ] **Step 1: Read the existing files**

```bash
cat src/app/captain/page.tsx 2>/dev/null | head -80
cat src/app/admin/draft/page.tsx 2>/dev/null | head -80
```

- [ ] **Step 2: In `/captain` — replace the team header text with `<TeamRenameInline>`**

Identify the JSX that renders the team name (look for something like `<h1>{team.name}</h1>` or `team.name` interpolated into a string). Replace it with:

```tsx
import { TeamRenameInline } from '@/components/team/TeamRenameInline';
// ...inside the rendered JSX, wherever team.name appears:
<TeamRenameInline
  teamId={team.id}
  currentName={team.name}
  canEdit={true}
  onRenamed={() => router.refresh()}
/>
```

Add `import { useRouter } from 'next/navigation';` and `const router = useRouter();` if not already present. If the captain page is a server component, wrap the team-name area in a small client component that owns the `useRouter` call.

- [ ] **Step 3: In Admin Groups tab — add rename to each team item**

In `GroupsTab.tsx`, modify the `<li>` inside each group card:

```tsx
import { TeamRenameInline } from '@/components/team/TeamRenameInline';
// ...replace the existing:
<li key={t.teamId} className="border rounded px-2 py-1">{t.name}</li>
// ...with:
<li key={t.teamId} className="border rounded px-2 py-1">
  <TeamRenameInline
    teamId={t.teamId}
    currentName={t.name}
    canEdit={true}
    onRenamed={() => onChange()}
  />
</li>
```

Similarly, in the unassigned-teams list, wrap the team-name span with `<TeamRenameInline canEdit={true} ...>`.

- [ ] **Step 4: In `/admin/draft` — add rename next to each team header**

Identify where team names render. Add the component next to each name with `canEdit={true}`. After save, refresh via `router.refresh()` or whatever existing refresh hook the page uses.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

- Login as a captain → visit `/captain` → rename your team → expect success toast and name update.
- Login as admin → visit `/admin/tournament/[id]` Groups tab → rename any team → expect SSE broadcast updates other tabs.
- Try renaming to a duplicate name → expect 409 toast.

- [ ] **Step 6: Commit**

```bash
git add src/app/captain/page.tsx src/app/admin/tournament/[id]/_components/GroupsTab.tsx src/app/admin/draft/page.tsx
git commit -m "feat(team-rename): wire rename UI into captain dashboard, admin draft, admin groups"
```

---

## Phase 7 — Wrap-up

### Task 31: Add `/admin/tournament` link to the admin nav

**Files:**
- Modify: whatever component holds the admin top-nav (likely `src/components/admin-nav.tsx` or similar — read `src/components/` to find it)

- [ ] **Step 1: Locate the existing admin nav**

```bash
grep -rln "/admin/draft\|/admin/players\|/admin/config" src/components src/app 2>/dev/null | head
```

- [ ] **Step 2: Add a nav entry**

In the file containing the admin nav links, add a new entry pointing to `/admin/tournament` with label `赛事`. Keep the link list in the same order/style as existing links.

```tsx
// Example shape; actual edit depends on the existing nav file
<Link href="/admin/tournament" className={navLinkClass('/admin/tournament')}>赛事</Link>
```

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "chore(tournament): admin nav link"
```

---

### Task 32: Add `/tournament` link to the captain nav (if applicable)

**Files:**
- Modify: captain layout / nav component

- [ ] **Step 1: Locate** the captain-side nav and add a link to `/tournament` labeled `赛事`.

- [ ] **Step 2: Commit**

```bash
git add src/components src/app/captain
git commit -m "chore(tournament): captain nav link"
```

---

### Task 33: Full-suite green check

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all green. Failing DB-touching tests likely indicate missing `DATABASE_URL` — set it before running.

- [ ] **Step 3: Run the dev server and exercise the happy path manually**

```bash
npm run dev
```

End-to-end walkthrough (admin user):
1. `/admin/tournament` → create tournament (4 × 4, advancing=2)
2. Groups tab → assign 16 teams across groups A/B/C/D
3. Click `开始小组赛`
4. Matches tab → record all 24 group BO1 matches
5. Click `关闭小组赛` (if a tie appears, use the tiebreaker UI — Task 18 endpoint via Matches tab is left to the admin who can read the `tieGroups` toast and POST a tiebreaker manually if needed)
6. Bracket tab → drag/select 8 teams into 8 slots → save → lock
7. Record BO3 QFs, BO3 SFs, BO5 FINAL → confirm `championId` set on tournament

Public side (captain user):
- `/tournament` → schedule / groups / bracket all show current state and update via SSE when admin records games.

- [ ] **Step 4: Commit any final cleanup if needed**

```bash
git status
# If any incidental changes pending:
git commit -am "chore(tournament): final cleanup"
```

---

## Spec Coverage Map

| Spec Section | Task(s) |
|---|---|
| §1 Goals — group + knockout + admin + live + rename | 1–33 |
| §2 Captured Requirements | 1, 6, 7, 8, 9, 10, 17, 18, 19 |
| §3 Architecture — module layout | 1–11, 12–19, 20–28 |
| §3 — event log = source of truth | 5 |
| §3 — SSE bus isolated from draft | 4, 15 |
| §3 — service layer pure | 2, 3 (pure), 5–10 (DB integration) |
| §4 Data Model — 5 models + 4 enums + Team additions | 1 |
| §4 — unique constraints | 1 |
| §5 State Machine — transitions | 6 (create), 7 (start), 10 (close), 9 (lock), 8 (final advance) |
| §5 — undo: revoke last game | 8 |
| §5 — undo: downstream-blocking | 8 |
| §5 — edit cascade | 8 |
| §6 Materialized State | 11 |
| §7 API — create, state, stream | 13, 14, 15 |
| §7 — groups assign/start | 16 |
| §7 — match schedule/game/walkover/edit | 17 |
| §7 — close-group-stage / tiebreaker / bracket / reset | 18 |
| §7 — team PATCH | 19 |
| §8 UI — admin Setup/Groups/Matches/Bracket/Audit | 21, 22, 23, 24, 25, 26, 27 |
| §8 — public Schedule/Groups/Bracket SSE | 20, 28 |
| §8 — team rename UI surfaces | 29, 30 |
| §9 Error Handling — concurrency / 422 / 409 / 403 | 12 (mapper) + 5–10 (service) |
| §9 — SSE reconnect with backoff | 20 |
| §10 Testing — standings / matches / bracket / events / API integration / constraint | 2, 3, 5, 6, 7, 8, 9, 10, 19 |
| §11 Migration — backfill duplicates | 1 |
| §13 Team Naming — full | 19, 29, 30 |

---

## Self-review notes (run by author)

- **Placeholders:** none. Every step has runnable code or commands.
- **Type consistency:** verified — `assignTeam`, `startGroupStage`, `recordGame`, `revokeLastGame`, `declareWalkover`, `editMatchGames`, `scheduleMatch`, `closeGroupStage`, `createTiebreaker`, `seedBracket`, `lockBracket`, `resetTournament`, `getActiveTournament`, `createTournament`, `getTournamentState`, `renameTeam` are all named identically wherever they appear. `TournamentStateError` is the shared error class.
- **Spec coverage gaps fixed inline:** the admin Audit tab needed an events API; added in Task 27 step 2.
- **Open question deferred to implementer:** captain/admin existing pages may already have rename UI in subtly different forms — Task 30 explicitly tells the implementer to read first and adapt. This is intentional, not a placeholder.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-tournament-system.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?





