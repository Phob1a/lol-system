# Player Profile Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public leaderboard table with a selectable player profile explorer that keeps dense stats and adds win rate, common champions, recent form, and recent match details.

**Architecture:** Extend `player-stats-service` so one backend query can return all active-tournament player profiles. Reuse that shape in the public leaderboard API, then replace `LeaderboardView` with a client-side explorer that selects and filters already-loaded profiles. Keep the existing single-player route compatible by returning the same enriched profile shape.

**Tech Stack:** Next.js App Router, Prisma, React client components, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Enrich Player Stats Service

**Files:**
- Modify: `src/lib/tournament/player-stats-service.ts`
- Modify: `src/lib/tournament/player-stats-service.test.ts`

- [x] Add failing service tests for win rate, common champion aggregation, and recent-game ordering.
- [x] Extend `PlayerTournamentStats` with `registrationId`, `teamName`, `primaryPosition`, `winRate`, `commonChampions`, and recent-first `games`.
- [x] Add `listPlayerTournamentProfiles(db, tournamentId)` to return all registered player profiles for the active tournament.
- [x] Run `npm test -- src/lib/tournament/player-stats-service.test.ts`.

### Task 2: Replace Leaderboard API Shape

**Files:**
- Modify: `src/app/api/tournament/public/leaderboard/route.ts`
- Modify: `src/components/tournament/LeaderboardView.tsx`

- [x] Change the API to return `{ profiles }` from `listPlayerTournamentProfiles`.
- [x] Keep the client tolerant of legacy `{ rows }` only during refactor if needed.
- [x] Ensure no per-player waterfall requests are needed for switching.

### Task 3: Build Mixed Profile Explorer UI

**Files:**
- Modify: `src/components/tournament/LeaderboardView.tsx`
- Modify: `src/components/tournament/LeaderboardView.test.tsx`

- [x] Add failing component tests for default selected player, player switching, search filtering, and recent W/L strip.
- [x] Replace table-only UI with mixed layout: selector, hero, metrics, common champions, recent match table.
- [x] Preserve links to `/tournament/player/[playerId]` and `/tournament/match/[matchId]`.
- [x] Run `npm test -- src/components/tournament/LeaderboardView.test.tsx`.

### Task 4: Verify Integration

**Files:**
- Modify only files above unless type fixes require local changes.

- [x] Run focused tests for service and component.
- [x] Run `npm run typecheck`.
- [x] Start the dev server and inspect `/tournament` in desktop and mobile widths when feasible.
