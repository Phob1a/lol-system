# Tournament System Design

**Status:** Approved (brainstorming)
**Date:** 2026-05-11
**Author:** lixuan.dai (with Claude)
**Scope:** Extend the existing draft system with a tournament phase covering group stage + single-elimination knockout, admin scheduling and score entry, and public viewing pages.

---

## 1. Goals & Non-Goals

### Goals
- After the draft finishes, run a tournament that begins with a configurable group stage and converges to a single champion through a single-elimination knockout.
- Group stage: BO1 round-robin within each group; 1 point per win, 0 per loss.
- Knockout: QF = BO3 (×4), SF = BO3 (×2), Final = BO5 (×1). No third-place match.
- Admin can schedule each match (date + time), record scores game-by-game, mark walkovers, and edit finished matches.
- Public pages show schedule, group composition, group standings, and the knockout bracket. Updates are live (SSE).
- Mirror the existing event-sourced draft architecture (`DraftSession` + `DraftEvent`) so undo and audit work natively.

### Non-Goals (v1)
- Multiple concurrent tournaments / seasons. Only one active tournament at a time; previous ones are archived as read-only.
- Captain self-reporting of scores. Score entry is admin-only.
- Per-game telemetry (kills, gold, draft picks, side selection). Only winner per game is recorded.
- Third-place match.
- In-app match streaming / VOD links (future extension).
- Push notifications.

---

## 2. Captured Requirements

| Dimension | Decision |
|---|---|
| Team count / structure | Admin configures `groupCount`, `teamsPerGroup`, `advancingPerGroup` at tournament creation. Hard constraint: `advancingPerGroup × groupCount == 8`. |
| Group format | BO1 single round-robin. Win = 1 pt, Loss = 0 pt. |
| Tiebreak | Head-to-head sub-table first. If still tied, admin schedules a BO1 tiebreaker match between tied teams. |
| Knockout format | QF = BO3 ×4, SF = BO3 ×2, Final = BO5 ×1. No 3rd-place. |
| Bracket seeding | Admin manually drags 8 advancing teams into 8 bracket slots after group stage closes. |
| Match timing | Each match has a concrete `scheduledAt` (date + time). |
| Score detail | Game-by-game (winner per game). Series auto-completes when threshold reached. |
| Permissions | Admin-only score entry/edit. Walkover supported. |
| Lifecycle | Singleton active tournament; created from a finished draft; previous tournaments archived. |

---

## 3. Architecture

### Module Layout

```
src/
├── lib/tournament/
│   ├── tournament-service.ts        # create / reset / state transitions
│   ├── groups-service.ts            # group assignment, round-robin generation
│   ├── matches-service.ts           # score entry, revoke, edit, walkover
│   ├── standings-service.ts         # points + head-to-head + tie detection
│   ├── bracket-service.ts           # bracket seeding + knockout advancement
│   └── tournament-events.ts         # event construct/apply/replay
├── server/
│   └── tournament-bus.ts            # SSE broadcaster (mirrors draft-bus)
├── app/api/tournament/              # thin route handlers (authz + Zod → service)
├── app/admin/tournament/            # admin console (Setup/Groups/Matches/Bracket/Audit)
└── app/tournament/                  # public viewing (Schedule/Groups/Bracket)
```

### Boundaries

- **Service layer is pure functions** taking `db: PrismaClient` and a Zod-validated input; returns domain objects. Unit-testable without Next/NextAuth.
- **Event = source of truth.** All mutations go through `tournament-events.append()`, which inside a single transaction: applies the change, increments `Tournament.seq`, inserts a `TournamentEvent`, and updates materialized columns.
- **Route layer** only handles authz (`requireAdmin` / `requireUser`), Zod validation, and service invocation. Pattern follows existing `src/lib/api-guards.ts`.
- **SSE** uses an isolated `tournament-bus` (separate EventEmitter from draft-bus); broadcasts `STATE_UPDATED` to all subscribed viewers.

---

## 4. Data Model (Prisma additions)

### New Enums

```prisma
enum TournamentStatus {
  NOT_STARTED        // tournament row exists, group assignment not finished
  GROUP_STAGE        // round-robin in progress
  BRACKET_SEEDING    // group stage closed, awaiting admin bracket arrangement
  KNOCKOUT           // knockout in progress
  FINISHED           // final concluded
}

enum MatchPhase {
  GROUP        // group round-robin
  TIEBREAKER   // BO1 ad-hoc tiebreaker
  QF           // quarter-final BO3
  SF           // semi-final BO3
  FINAL        // grand final BO5
}

enum MatchFormat { BO1  BO3  BO5 }

enum MatchStatus {
  SCHEDULED      // created, not played
  IN_PROGRESS    // at least one game recorded, threshold not reached
  FINISHED       // series concluded normally
  WALKOVER       // concluded by forfeit
  CANCELLED      // cancelled (e.g., abandoned tiebreaker)
}

enum TournamentEventType {
  TOURNAMENT_CREATED      GROUPS_DEFINED          TEAM_ASSIGNED
  MATCHES_GENERATED       MATCH_SCHEDULED         MATCH_RESCHEDULED
  GAME_RECORDED           GAME_REVOKED            MATCH_FINISHED
  MATCH_EDITED            MATCH_WALKOVER          TIEBREAKER_CREATED
  GROUP_STAGE_CLOSED      BRACKET_SEEDED          BRACKET_LOCKED
  KNOCKOUT_ADVANCED       TOURNAMENT_FINISHED     TOURNAMENT_RESET
}
```

### New Models

```prisma
model Tournament {
  id                String           @id @default(cuid())
  name              String
  status            TournamentStatus @default(NOT_STARTED)
  groupCount        Int
  teamsPerGroup     Int
  advancingPerGroup Int                                    // groupCount * advancing == 8
  seq               Int              @default(0)           // event sequence / optimistic lock
  startedAt         DateTime?
  finishedAt        DateTime?
  championId        String?
  champion          Team?            @relation("TournamentChampion", fields: [championId], references: [id])

  groups   Group[]
  matches  Match[]
  events   TournamentEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("tournaments")
}

model Group {
  id           String     @id @default(cuid())
  tournamentId String
  letter       String                                      // "A" / "B" / ...
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
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
  @@unique([teamId])                                       // a team belongs to exactly one group
  @@map("group_teams")
}

model Match {
  id           String      @id @default(cuid())
  tournamentId String
  phase        MatchPhase
  format       MatchFormat
  status       MatchStatus @default(SCHEDULED)

  // GROUP / TIEBREAKER
  groupId      String?

  // KNOCKOUT
  roundIndex   Int?                                        // 0=QF, 1=SF, 2=FINAL
  matchIndex   Int?                                        // index within the round
  nextMatchId  String?                                     // where the winner advances
  nextSide     String?                                     // 'A' or 'B'

  teamAId      String?                                     // null until bracket reveals
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
  gameNumber   Int                                         // 1..5
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
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  createdAt    DateTime   @default(now())
  @@unique([tournamentId, seq])
  @@index([tournamentId, createdAt])
  @@map("tournament_events")
}
```

### `Team` Additions (back-relations only — no column changes)

```prisma
model Team {
  // ... existing fields untouched ...

  groupTeam      GroupTeam?
  matchesAsA     Match[]      @relation("MatchTeamA")
  matchesAsB     Match[]      @relation("MatchTeamB")
  matchesWon     Match[]      @relation("MatchWinner")
  gamesWon       MatchGame[]  @relation("GameWinner")
  tournamentsWon Tournament[] @relation("TournamentChampion")
}
```

### Constraint Summary

| Invariant | Enforcement |
|---|---|
| One team in at most one group (within the single active tournament) | `GroupTeam.teamId @unique` |
| One group letter per tournament | `@@unique([tournamentId, letter])` |
| Unique game number per series | `@@unique([matchId, gameNumber])` |
| Monotonic event sequence | `@@unique([tournamentId, seq])` + single-transaction INSERT |
| nullable field semantics by phase | Zod schema at service entry (DB does not enforce CHECK) |

> Note: `GroupTeam.teamId @unique` is a global unique. This is acceptable because only **one** tournament is active at a time, and reset cascades delete the old tournament's `GroupTeam` rows (via `Group → Tournament` cascade) before any new assignments happen.

---

## 5. State Machine

```
                                                  ┌──────────────────────────────┐
                                                  │  TOURNAMENT_RESET (admin)    │
                                                  │  → archive + new NOT_STARTED │
                                                  └──────────────────────────────┘
                                                              ▲
                                                              │ any state
                                                              │
   ┌──────────────┐         ┌──────────────┐         ┌──────────────────┐         ┌──────────────┐         ┌──────────────┐
   │ NOT_STARTED  │ ──────▶ │ GROUP_STAGE  │ ──────▶ │ BRACKET_SEEDING  │ ──────▶ │  KNOCKOUT    │ ──────▶ │  FINISHED    │
   └──────────────┘         └──────────────┘         └──────────────────┘         └──────────────┘         └──────────────┘
       create + config         groups full +              group stage closed              bracket locked            FINAL concluded
                              matches generated              + ties resolved                                       ↓ championId written
```

### Transition Preconditions

| Transition | Trigger | Service-Level Checks | Events Emitted |
|---|---|---|---|
| `NOT_STARTED → GROUP_STAGE` | admin "Start Group Stage" | (1) every Group filled to `teamsPerGroup`; (2) draft = FINISHED; (3) `advancing × groups == 8` | `MATCHES_GENERATED` |
| `GROUP_STAGE → BRACKET_SEEDING` | admin "Close Group Stage" | (1) all `phase=GROUP` matches in `{FINISHED, WALKOVER}`; (2) `standings-service` reports no unresolved ties (any tied group must have its TIEBREAKER created and finished) | `GROUP_STAGE_CLOSED` with advancing-8 list |
| `BRACKET_SEEDING → KNOCKOUT` | admin "Lock Bracket" | 4 QF matches have non-null `teamAId`/`teamBId`; the 8 teams are unique | `BRACKET_SEEDED` + `BRACKET_LOCKED` |
| `KNOCKOUT → KNOCKOUT` (advance) | any knockout match finishes | winner pushed into `nextMatchId.nextSide` slot | `MATCH_FINISHED` + `KNOCKOUT_ADVANCED` |
| `KNOCKOUT → FINISHED` | FINAL match finishes | `phase == FINAL` and winner determined; write `Tournament.championId` | `MATCH_FINISHED` + `TOURNAMENT_FINISHED` |
| any → `NOT_STARTED` | admin explicit reset | rename current row `[archived] <name>`, create fresh tournament row | `TOURNAMENT_RESET` |

### Undo Semantics

- **Revoke last game** (`GAME_REVOKED`): delete the last `MatchGame`, recompute match status (rewind FINISHED→IN_PROGRESS if applicable). If revoking causes the match to fall back from FINISHED and the winner had already been pushed into a downstream knockout slot, the downstream slot is cleared (set `teamAId` or `teamBId` to null) in the same transaction. This is permitted only if the downstream match has zero games recorded; otherwise return 422 with `{ blockingMatchId }`.
- **Edit a finished match** (`MATCH_EDITED`): rewrite the games array; if the winner changes and was already advanced, emit a cascade of `KNOCKOUT_ADVANCED` reversals down the bracket (only allowed if no downstream matches have games recorded; otherwise reject with `blockingMatchId`).
- **Edit a finished WALKOVER**: the `/edit` endpoint accepts a fresh games array, clears `walkoverNote`, and treats the match as normal from that point. Downstream-blocking rules apply identically.

---

## 6. Materialized State (read path)

```ts
async function getTournamentState(id: string) {
  const t = await db.tournament.findUnique({
    where: { id },
    include: { groups: { include: { teams: true } }, matches: { include: { games: true } } },
  });
  const standings = computeStandings(t.matches.filter(m => m.phase === 'GROUP'));
  const bracket   = computeBracket(t.matches.filter(m => isKnockout(m.phase)));
  const schedule  = sortBy(t.matches, m => m.scheduledAt);
  return { tournament: t, standings, bracket, schedule };
}
```

- **Standings**: group teams by points → for each tied subgroup, build head-to-head sub-table → if still tied, attach `tieGroup: { groupId, tiedTeamIds }` to the response so the UI can prompt admin.
- **Bracket**: project all knockout matches into a tree via `roundIndex / matchIndex / nextMatchId`. Frontend renders by position.

---

## 7. API Surface

All routes under `src/app/api/tournament/`. Admin routes guarded by `requireAdmin`.

| Method + Path | Auth | Purpose | Key Validation |
|---|---|---|---|
| `POST /create` | ADMIN | Create tournament: `{ name, groupCount, teamsPerGroup, advancingPerGroup }` | draft = FINISHED; `advancing × groups == 8`; no other active tournament |
| `GET /[id]/state` | logged-in | Returns `{ tournament, standings, bracket, schedule }` | — |
| `GET /[id]/stream` | logged-in | SSE stream of `STATE_UPDATED` | — |
| `POST /[id]/groups/assign` | ADMIN | Body: `{ teamId, groupLetter }` | status = NOT_STARTED; one team per group; capacity not exceeded |
| `POST /[id]/groups/start` | ADMIN | Validate groups filled, generate all GROUP matches, transition to GROUP_STAGE | See transition table |
| `POST /[id]/match/[mid]/schedule` | ADMIN | Write `scheduledAt` | Match exists; not FINISHED |
| `POST /[id]/match/[mid]/game` | ADMIN | Body: `{ winnerTeamId }`, appends next game | `gameNumber = current_games + 1`; winner ∈ {teamA, teamB}; not at FINISHED threshold |
| `DELETE /[id]/match/[mid]/game` | ADMIN | Revoke last game | If FINISHED and winner advanced + downstream has games → reject |
| `POST /[id]/match/[mid]/walkover` | ADMIN | Body: `{ winnerTeamId, note? }` | Sets status=WALKOVER, winner |
| `POST /[id]/match/[mid]/edit` | ADMIN | Rewrite games array | If downstream blocked, reject with `blockingMatchId` |
| `POST /[id]/close-group-stage` | ADMIN | Transition to BRACKET_SEEDING | If unresolved ties → 422 with `{ tieGroups: [{ groupId, tiedTeamIds }] }` |
| `POST /[id]/tiebreaker` | ADMIN | Create a BO1 TIEBREAKER between tied teams | Teams must belong to a tied set inside the same group |
| `POST /[id]/bracket/seed` | ADMIN | Body: `{ slots: [teamId × 8] }` — create 4 QF + 2 SF + 1 FINAL matches with nextMatchId chain | 8 distinct team IDs; status = BRACKET_SEEDING |
| `POST /[id]/bracket/lock` | ADMIN | Transition to KNOCKOUT | See transition table |
| `POST /[id]/reset` | ADMIN | Archive current, create fresh tournament row in NOT_STARTED | — |

All write operations execute in a single Prisma transaction:

```
db.$transaction([
  INSERT INTO tournament_events (..., seq = current + 1),
  UPDATE tournaments SET seq = current + 1, ...,
  ...materialized updates (matches, match_games, groups, group_teams)
])
```

---

## 8. UI Surface

### Admin Console `/admin/tournament/[id]` — Tabs

| Tab | Contents |
|---|---|
| **Setup** | Name, group config (read-only unless NOT_STARTED), Reset button |
| **Groups** | Left: ungrouped team pool. Right: N group cards with `@dnd-kit` drag-drop. Editable in NOT_STARTED only. |
| **Matches** | Tables grouped by phase (Group A / Group B / ... / TIEBREAKER / QF / SF / FINAL). Each row: [Schedule] [Record Game] [Edit] [Walkover] [Revoke Last]. Status badges: SCHEDULED / IN_PROGRESS / FINISHED. |
| **Bracket** | If BRACKET_SEEDING: 8 slots + advancing team pool (drag to fill). If LOCKED: tree visualization; click a match to record/revoke. |
| **Audit** | `TournamentEvent` rows in reverse chronological order (actor, type, payload digest). Mirrors draft audit page styling. |

### Public Viewing `/tournament` (single page, SSE-connected)

| Tab | Contents |
|---|---|
| **Schedule** | Matches sorted by `scheduledAt`, sectioned by Today / Tomorrow / This Week / Past. Each row shows opponents, status, live series score (e.g., `1-0`). |
| **Groups** | N group tables (W / L / Pts). Tied rows highlighted; head-to-head expand. Banner if tiebreaker pending. |
| **Bracket** | Bracket tree visualization. Each match cell shows series score and status. |

Updates pushed via SSE; client uses `EventSource` with exponential backoff reconnect (same pattern as draft).

---

## 9. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Concurrent admin writes | `Tournament.seq` optimistic lock: `UPDATE … WHERE seq = $expected`. On mismatch return 409 ("please reload"). |
| Duplicate game submission | `(matchId, gameNumber)` unique → DB error → service translates to 409. |
| Winner not in match | Zod validation rejects with 400. |
| Closing group stage with ties | 422 with `tieGroups` payload; Matches tab auto-shows banner. |
| Revoking already-advanced winner | 422 with `blockingMatchId`; UI directs admin to revoke downstream first. |
| Creating tournament with active draft | Guard returns 403. |
| SSE disconnect | EventSource auto-reconnect with backoff (pattern reused from draft-bus). |
| Reset semantics | Current row renamed `[archived] <name>`, fresh tournament row inserted. Historical data preserved. |
| Walkover edits | Editing a WALKOVER goes through `/edit`, clears `walkoverNote`, accepts fresh games. Same downstream-blocking rules. |

---

## 10. Testing Strategy

vitest (already configured).

| Layer | Cases |
|---|---|
| **standings-service** unit | (1) all-distinct wins → simple sort; (2) two-team tie with reciprocal head-to-head → tieGroup flagged; (3) three-team cyclic tie → tieGroup flagged; (4) post-tiebreaker → resolved. |
| **matches-service** unit | BO1 (1-0); BO3 (2-0 / 2-1 / 1-2); BO5 (3-0 / 3-1 / 3-2); revoke last game; revoke when downstream blocked. |
| **bracket-service** unit | seed 8 → creates 4 QF + 2 SF + 1 FINAL with correct `nextMatchId` chain; QF finish → SF teamA/teamB filled correctly; FINAL finish → championId written. |
| **tournament-events** unit | seq monotonicity; concurrent event simulation (one succeeds, one 409); replay from events reconstructs state. |
| **API integration** | Full lifecycle: create → assign → start → record all GROUP matches → close (with and without ties) → tiebreaker if needed → seed → lock → record QF/SF/FINAL → championId written. |
| **DB constraint tests** | Same team in two groups → fails; duplicate group letter → fails; duplicate gameNumber → fails. |

---

## 11. Migration Plan

1. **Prisma migration** `add_tournament_models`: adds the 5 new models + 4 enums + 6 back-relation fields on `Team`. No data backfill needed (no existing tournament data).
2. **Seed script update** (`prisma/seed.ts`): optionally seed a sample tournament in dev. Not required.
3. **Rollback**: drop new tables; back-relations on `Team` are optional, so removing them is non-breaking.

---

## 12. Open Questions (deferred to plan stage)

- Bracket visualization style — SVG-based vs grid-based. Both viable; pick during implementation.
- Localization of the Public tab — Chinese-first or bilingual. Align with the app's current convention (mixed).
- Audit tab pagination threshold (e.g., 50 events per page).

These are implementation-detail choices and do not block the design.
