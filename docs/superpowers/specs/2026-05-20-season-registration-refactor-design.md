# Season / Registration Refactor Design

**Status:** Approved (brainstorming)
**Date:** 2026-05-20
**Author:** lixuan.dai (with Claude)
**Scope:** Refactor the `main`-branch draft system into a multi-season platform. This spec covers the season lifecycle, a public anonymous registration page, admin-appointed captains with per-team accounts (replacing per-player accounts), the draft engine retargeted to season-scoped participants, a re-laid-out admin draft page, and a new public anonymous spectator page. The tournament / knockout phase is explicitly **out of scope** and deferred to a later spec.

---

## 1. Goals & Non-Goals

### Goals
- Run an open-ended series of **seasons**; each season's data is retained permanently and viewable read-only after archival.
- Provide a **public, anonymous registration page** where players self-register for the active season.
- After registration closes, the admin assigns each registrant a `cost`, then **appoints captains**. The system creates **one temporary account per team** for the draft and later phases — players no longer get individual accounts.
- Keep the draft mechanic essentially unchanged (event-sourced engine, 4 round modes), retargeted from `Player` to season-scoped `Registration`, with team count fully parameterized (supports 12–16+ teams).
- Re-lay-out the **admin draft page** for a livestream-friendly arrangement.
- Add a **public anonymous spectator page** (`/live`) where viewers watch the draft in real time on their own devices (responsive: desktop + mobile equally supported).

### Non-Goals (this spec)
- Tournament / group stage / knockout phase. The existing `2026-05-11-tournament-design.md` is **partially superseded** (see §10) and will be revised in a follow-up.
- Player self-service editing or withdrawal of a submitted registration (submit is final; admin edits).
- Hover/popover team-detail cards on the spectator page (planned future extension; component interface is designed to allow it).
- Multi-instance deployment / Redis pub-sub for SSE (single-instance constraint accepted).
- CAPTCHA on the public form (admin moderation + duplicate-block is sufficient).
- Re-layout of the captain operating page (unchanged).

---

## 2. Captured Requirements

| Dimension | Decision |
|---|---|
| Player identity | Cross-season master `Player` record (keyed by `gameId`) + per-season `Registration` entity. All draft FKs point to `Registration`. |
| Registration access | Public, anonymous (no login). |
| Registration edit | Submit locks the record. Duplicate `gameId` in the same season errors. Admin may edit any registration. |
| Team accounts | System-generated. Admin views credentials in the admin console and hands them off. Replaces per-player accounts. |
| Credential delivery | `username` always visible; password shown plaintext **once** at generation/reset; DB stores hash only; admin can **reset** to regenerate. |
| Existing data | No production data — drop & rebuild the schema. |
| Draft UI | Re-layout the **admin** draft page only. Add a new public spectator page. Captain page unchanged. |
| Team count | Fully parameterized (12–16+); spectator team grid is responsive 4×N. |
| Spectator devices | Desktop and mobile equally important. |

---

## 3. Architecture

### 3.1 Data Model

Core idea: `Season` owns everything; `Player` becomes a pure cross-season identity record; `Registration` carries a player's per-season participation attributes; `User` is login-only (admin + team accounts).

#### New Enums

```prisma
enum SeasonStatus {
  SETUP          // created, registration not yet opened
  REGISTRATION   // public form open
  ROSTER_LOCKED  // registration closed; admin assigning costs / appointing captains
  DRAFTING       // draft in progress
  COMPLETED      // draft finished (latest season)
  ARCHIVED       // historical, read-only
}

enum RegistrationStatus {
  ACTIVE
  EXCLUDED       // admin removed this registrant from the pool
}
```

`Position`, `Role` (`ADMIN` / `CAPTAIN`), `DraftStatus`, `RoundMode`, `RoundStatus`, `EventType` are unchanged.

#### New Models

```prisma
model Season {
  id         String       @id @default(cuid())
  name       String
  status     SeasonStatus @default(SETUP)
  teamBudget Float        @default(1000)
  createdAt  DateTime     @default(now())
  archivedAt DateTime?

  registrations Registration[]
  teams         Team[]
  draftSession  DraftSession?

  @@map("seasons")
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
  @@map("registrations")
}
```

#### Changed Models

```prisma
model Player {                       // master identity only
  id            String         @id @default(cuid())
  gameId        String         @unique
  nickname      String                                  // latest known
  registrations Registration[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  @@map("players")
}

model User {                         // login only: ADMIN + team accounts
  id            String   @id @default(cuid())
  username      String   @unique                        // was gameId
  passwordHash  String
  mustChangePwd Boolean  @default(true)                  // true for ADMIN seed; false for team accounts
  role          Role     @default(CAPTAIN)
  team          Team?                                    // set for team accounts; null for ADMIN
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@map("users")
}

model Team {
  id         String       @id @default(cuid())
  seasonId   String
  name       String
  captainId  String       @unique                       // → Registration
  userId     String       @unique                       // → team account
  budgetLeft Float        @default(0)                    // initialized at draft start
  createdAt  DateTime     @default(now())

  season  Season       @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  captain Registration @relation("TeamCaptain", fields: [captainId], references: [id])
  account User         @relation(fields: [userId], references: [id])
  slots   TeamSlot[]
  picks   DraftPick[]  @relation("PickingTeam")
  @@map("teams")
}

model TeamSlot {
  id             String   @id @default(cuid())
  teamId         String
  position       Position
  registrationId String?                                 // was playerId
  team         Team          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  registration Registration? @relation(fields: [registrationId], references: [id])
  @@unique([teamId, position])
  @@map("team_slots")
}

model DraftSession {                  // one per season
  // existing fields: status, currentRound, onTheClock, seq, startedAt, finishedAt
  seasonId String @unique
  season   Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  // ... rounds, events unchanged
}

model DraftPick {
  // existing fields unchanged except:
  registrationId String                                  // was playerId → Registration
  // byCaptainId still references the captain's Registration id
}
```

`Config` is **removed**; `teamBudget` lives on `Season`. A team always has exactly one `TeamSlot` per `Position` (5 positions), so the slot count is fixed, not configurable. `DraftRound` and `DraftEvent` are unchanged structurally.

### 3.2 Key Invariants (DB-enforced)

| Invariant | Enforcement |
|---|---|
| One identity per `gameId` across seasons | `Player.gameId @unique` |
| One registration per player per season | `Registration @@unique([seasonId, playerId])` |
| One team per captain | `Team.captainId @unique` |
| One account per team | `Team.userId @unique` |
| One draft session per season | `DraftSession.seasonId @unique` |
| One slot per position per team | `TeamSlot @@unique([teamId, position])` |
| Single active (non-archived) season | Service-layer rule (see §4) |

### 3.3 Module Layout

```
src/
├── lib/
│   ├── season/season-service.ts          # lifecycle, create / archive, transitions
│   ├── registration/
│   │   ├── registration-service.ts        # public submit, admin edit / exclude / add
│   │   └── registration-schema.ts         # Zod
│   ├── captains/captain-service.ts        # appoint / revoke captains → Team + account
│   ├── draft/                             # existing engine; FKs retargeted to Registration
│   └── teams/                             # team rename, credential reset
├── server/draft-bus.ts                    # existing in-process SSE broadcaster
├── app/
│   ├── register/                          # PUBLIC registration page
│   ├── live/                              # PUBLIC spectator page (read-only, SSE)
│   ├── admin/season/                      # season management
│   ├── admin/registrations/               # review / cost / appoint
│   ├── admin/teams/                       # team accounts + credentials
│   ├── admin/draft/                       # re-laid-out admin draft page
│   └── api/                               # thin route handlers (authz + Zod → service)
```

Service layer = pure functions taking `db` + Zod-validated input; route layer handles authz + validation only. Mirrors the existing draft architecture.

---

## 4. Season Lifecycle & State Machine

```
            ┌─────────┐  open reg   ┌──────────────┐  close reg  ┌───────────────┐
  admin ──▶ │  SETUP  │ ──────────▶ │ REGISTRATION │ ──────────▶ │ ROSTER_LOCKED │
  create    └─────────┘             └──────────────┘ ◀────────── └───────────────┘
                                          ▲   reopen registration       │ start draft
                                          └────────────────────────────┐│
                                                                        ▼▼
   ┌──────────┐                       ┌───────────┐  draft done  ┌──────────┐
   │ ARCHIVED │ ◀── auto on new season │ COMPLETED │ ◀─────────── │ DRAFTING │
   └──────────┘     (any active season)└───────────┘              └──────────┘
```

### Transition Preconditions

| Transition | Trigger | Service-Level Checks |
|---|---|---|
| `SETUP → REGISTRATION` | admin "Open Registration" | `teamBudget` set |
| `REGISTRATION → ROSTER_LOCKED` | admin "Close Registration" | ≥ 1 registration (soft check) |
| `ROSTER_LOCKED → REGISTRATION` | admin "Reopen Registration" | — (recovery from accidental close) |
| `ROSTER_LOCKED → DRAFTING` | admin "Start Draft" | ≥ 1 captain appointed; every captain's `cost` set; all Teams + team accounts created → creates `DraftSession`, initializes per-team `budgetLeft = teamBudget − captain.cost`, creates one `TeamSlot` per position, auto-places each captain |
| `DRAFTING → COMPLETED` | draft finishes | `DraftSession.status = FINISHED` |
| any active → `ARCHIVED` | admin creates a new season | confirmed by admin; the prior non-archived season is auto-archived |

### Two-Layer State

`Season.status` is the coarse lifecycle. The draft's fine-grained state (rounds, progress) lives in `DraftSession.status` (`NOT_STARTED` / `IN_PROGRESS` / `FINISHED`). Draft reset/rewind happens inside `DRAFTING` without changing `Season.status`. **Single source of truth:** coarse → `Season`; draft detail → `DraftSession`.

### Single Active Season

At most one season has `status != ARCHIVED`. Creating a new season is allowed at any time; if a non-archived season exists, the admin confirms and it is auto-archived in the same transaction.

### Public Page Visibility

- `/register` accepts submissions only when the active season is `REGISTRATION`; otherwise renders a "not open / closed" placeholder.
- `/live` shows the active season's draft (`DRAFTING` / `COMPLETED`) and offers a season selector to view archived seasons' final draft state read-only.

---

## 5. Public Registration

### 5.1 Form (`/register`, anonymous)

| Field | Validation (Zod) |
|---|---|
| `gameId` | required, trimmed, length 2–32 |
| `nickname` | required, length 2–20 |
| `primaryPositions[]` | multi-select, ≥ 1 of TOP/JUG/MID/ADC/SUP |
| `secondaryPositions[]` | multi-select, optional, disjoint from primary |
| `currentRank` | required free text, length 1–20 |
| `peakRank` | required free text, length 1–20 |
| `willingToCaptain` | boolean, default false |
| `statement` | optional free text, ≤ 200 chars |

`cost` is **not** in the form — admin assigns it after registration closes. Ranks are free text (LoL rank notations vary).

### 5.2 Submission Flow (`POST /api/register`, public, no auth)

1. Zod-validate the form.
2. Load the active season; if status ≠ `REGISTRATION` → 409 ("registration not open / closed").
3. Find-or-create the `Player` master by `gameId` (also refresh `Player.nickname` to the latest value).
4. Create the `Registration` (seasonId + playerId + nickname + positions + ranks + willingToCaptain + statement; `status = ACTIVE`, `cost = 0`).
5. `@@unique([seasonId, playerId])` violation → 409 ("this gameId is already registered this season").
6. Success → confirmation page. **Submit is final** — no edit link, no withdrawal.

`GET /api/register/status` (public) tells the page whether to render the form or the closed placeholder.

### 5.3 Anti-Abuse (deliberately minimal)

- Duplicate `gameId` is blocked by the unique constraint.
- Light per-IP rate limit (e.g. 10 submissions/minute) deters scripted spam.
- No CAPTCHA. Bad registrations are excluded/deleted by the admin.

### 5.4 Admin Side (`/admin/registrations`)

Current-season registration list — columns: gameId, nickname, positions, ranks, willing-to-captain flag, **editable `cost`**, captain flag, status. Admin can: edit any field, set `cost`, exclude (`status = EXCLUDED`) or delete a registration, manually add a single registration, and appoint captains (§6). The existing CSV/XLSX import is retargeted to bulk-create `Registration` rows as an optional backfill path.

API: `GET/POST /api/admin/registrations`, `PATCH/DELETE /api/admin/registrations/[id]` — all `requireAdmin`.

---

## 6. Captains & Team Accounts (Auth Refactor)

### 6.1 Auth Model

`User` has exactly two kinds, fully decoupled from `Player`:

- **ADMIN** — standalone, seed-created, keeps `mustChangePwd` (forced change of the seeded default).
- **Team account** (`role = CAPTAIN`) — generated when a captain is appointed; `User.teamId` binds it to one team. The captain uses it to log in and operate the draft and later phases.
- **Players** — no account.

### 6.2 Appoint Captain (during `ROSTER_LOCKED`)

Admin selects a registration on `/admin/registrations` and appoints it as captain. In a single transaction:

1. `Registration.isCaptain = true`.
2. Create a `Team` (seasonId, default name `"<nickname> 队"`, `captainId` → this registration).
3. Generate the team account `User`: unique short `username` (e.g. `TEAM-A3F9`), random password, `role = CAPTAIN`, `mustChangePwd = false`.
4. Link `Team.userId`.

Per-team `budgetLeft`, the `TeamSlot`s (one per position), and captain auto-placement are deferred to **draft start** (so `cost` stays editable until then).

**Revoke captain:** before the draft starts, the admin may revoke a captain → cascade-delete that `Team` and its account, reset `isCaptain`.

### 6.3 Credential Generation & Delivery

- `username` is **always visible** in the admin console.
- The password is shown in **plaintext only at the moment of generation/reset**; the DB stores only the hash (no plaintext persisted).
- Each team row has a **"Reset Password"** action that regenerates a fresh password, again shown once, for hand-off.

### 6.4 Account Lifecycle

A team account is valid only for its season. The login service checks the account's team → season status; team accounts of an `ARCHIVED` season are rejected (403). A new season's appointments produce entirely new accounts.

### 6.5 Routing & Session

`middleware.ts`: `/admin/*` → ADMIN; draft operating pages → CAPTAIN; `/register` and `/live` → public, unguarded. NextAuth `CredentialsProvider` uses `username + password`. JWT claims: `id, username, role, teamId?, seasonId?`.

### 6.6 API

`POST /api/admin/registrations/[id]/appoint-captain`, `POST /api/admin/registrations/[id]/revoke-captain`, `GET /api/admin/teams`, `POST /api/admin/teams/[id]/reset-password`, `PATCH /api/teams/[id]` (rename team — captain-own or admin).

---

## 7. Draft Engine & UI

### 7.1 Engine (logic essentially unchanged)

Reuses the event-sourced engine (`DraftSession` + `DraftEvent`), the 4 round modes (`MANUAL` / `ADMIN_ORDER` / `REVERSE_LAST` / `BUDGET_DESC`), captain auto-placement, and pick revoke / round rewind. The only change: the participant entity is `Registration` instead of `Player`, and team count is fully parameterized (no hard-coded 8 — supports 12–16+). At draft start the engine initializes each team's `budgetLeft = teamBudget − captain.cost`, creates one `TeamSlot` per position, and places each captain in their position slot.

### 7.2 Admin Draft Page Re-layout (`/admin/draft`)

Adopts the **B-hybrid three-column** layout: left = player pool, center = a prominent "on the clock" hero panel above a responsive team grid, right = event stream timeline. An additional admin control region overlays draft operations (start draft, start round + pick mode, set order, rewind round, revoke pick). The captain operating page is **not** changed.

### 7.3 Public Spectator Page (`/live`, anonymous, read-only)

- **Desktop:** the same B-hybrid three-column layout, with no operation controls.
- **Mobile:** a pinned "on the clock" hero at the top; below it, tabs segment Player Pool / Teams / Event Stream.
- The team grid is responsive 4×N (16 teams = 4×4, visible on one screen). Each team card is the compact state — team name, 5 position dots (filled = drafted), budget bar.
- A **season selector** defaults to the active season's live draft and can switch to archived seasons' final draft state (read-only, no SSE).
- Player-detail hover popovers are a planned future extension; the `TeamCard` component interface is designed so the compact card can later mount a detail layer without restructuring.

### 7.4 Real-time (SSE)

Reuses the existing in-process `draft-bus` (`EventEmitter`). Adds a **public read-only** SSE surface: `GET /api/live/[seasonId]/state` and `GET /api/live/[seasonId]/stream`, broadcasting `STATE_UPDATED`. The existing authenticated admin/captain stream is retained. Draft state is non-sensitive, so the public stream is unguarded.

**Known constraint:** the `EventEmitter` approach locks deployment to a single instance. Acceptable for an internal tournament; a Redis pub-sub swap is a future extension if multi-instance is ever needed.

---

## 8. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Registration submitted when not `REGISTRATION` | 409 |
| Duplicate `gameId` within a season | 409 ("already registered") |
| Form validation failure | 400 + field-level messages |
| Concurrent draft picks | existing `DraftSession.seq` optimistic lock → 409 |
| Appoint captain when not `ROSTER_LOCKED` | 409 |
| Start draft with no captains / unset `cost` | 422 + reason |
| Login with an archived-season team account | 403 |
| Lost credentials | admin resets the password |
| Create a new season while one is active | confirm → prior season auto-archived |
| `/live` when the draft has not started | "draft not started" placeholder |
| SSE disconnect | `EventSource` exponential-backoff reconnect (existing pattern) |

---

## 9. Testing Strategy

vitest (already configured).

| Layer | Cases |
|---|---|
| **season-service** unit | status transitions; transition preconditions; single-active-season auto-archive rule |
| **registration-service** unit | `Player` master find-or-create; duplicate detection; Zod validation; admin edit / exclude / add |
| **captain-service** unit | appoint creates `Team` + account; revoke cascades; credential generation & reset |
| **draft engine** | existing tests retargeted to `Registration`; team count parameterized — run with N=8 and N=16 |
| **API integration** | full season lifecycle: create season → open registration → submit registrations → close → assign costs → appoint captains → start draft → picks → finish → archive → create next season |
| **DB constraint** | `unique(seasonId, playerId)`; unique team captain / account; one `DraftSession` per season |
| **auth** | admin login; team login; archived-season team login rejected; middleware role gates; public routes unguarded |

---

## 10. Migration Plan

No production data exists — clean rebuild.

1. Rewrite `prisma/schema.prisma` (add `Season`, `Registration`; refactor `Player`, `User`, `Team`, `TeamSlot`, `DraftSession`, `DraftPick`; remove `Config`).
2. `prisma migrate reset --force` + a new migration `season_registration_refactor`. No data backfill.
3. Rewrite `prisma/seed.ts`: seed one `ADMIN` account; optionally seed a dev-only sample season in `REGISTRATION` status with sample registrations.

### Impact on the existing tournament design

The existing `2026-05-11-tournament-design.md` declares "no multiple seasons" as a non-goal — **this spec reverses that assumption**. That tournament design (and its plan) requires a follow-up "multi-season adaptation" revision: a `Tournament` becomes season-scoped, and its hard `advancingPerGroup × groupCount == 8` constraint must be reconciled with 12–16-team seasons (e.g. 16 teams / 4 groups / 2 advancing = 8). This reconciliation is **out of scope here** and tracked as a follow-up spec.

---

## 11. Future Extensions (explicitly deferred)

- Tournament / group stage / knockout phase, adapted for multi-season.
- Hover/popover player- and team-detail cards on `/live`.
- Redis pub-sub for multi-instance SSE.
- CAPTCHA or stronger anti-abuse on the public form.
- Player self-service registration editing.
- **Per-player statistics.** The `Player` master is the cross-season anchor for
  career stats; `Registration` anchors per-season stats. Neither needs to change
  to support this. The gap is the *data source*: stats come from match/game
  data, which the tournament phase produces. The current tournament design
  records only the per-game winner (per-game telemetry is a stated non-goal), so
  rich per-player stats (e.g. KDA) require extending match recording **and** a
  new `PlayerGameStat(registrationId, matchGameId, …)` table. That table slots
  in additively against `Registration` and the future `MatchGame` with no
  refactor of the models in this spec. To be picked up alongside the tournament
  follow-up spec (§10).
