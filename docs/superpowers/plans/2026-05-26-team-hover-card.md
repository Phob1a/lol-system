# Team Hover Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable team hover details across spectator team grid, captain page, and admin draft page.

**Architecture:** Create `TeamHoverCard` as the team analogue of existing `PlayerHoverCard`. Convert both `DraftTeamSnapshot` and `TeamPreview` at component boundaries into one small `TeamHoverSummary` UI type.

**Tech Stack:** Next.js client components, React portals, Vitest, Testing Library.

---

### Task 1: Team Card Hover

**Files:**
- Create: `src/components/draft/TeamHoverCard.tsx`
- Modify: `src/components/draft/TeamCard.tsx`
- Test: `src/components/draft/TeamCard.test.tsx`

- [ ] Write a failing test that renders `TeamCard`, hovers the card, advances timers past 150ms, and expects the portal card to show captain name, `@gameId`, filled slots, empty slots, and budget.
- [ ] Run `npm test -- src/components/draft/TeamCard.test.tsx` and confirm it fails because the hover card does not exist.
- [ ] Implement `TeamHoverCard` and wrap the visible `TeamCard` content with it.
- [ ] Run `npm test -- src/components/draft/TeamCard.test.tsx` and confirm it passes.

### Task 2: Captain Page Team Hover

**Files:**
- Modify: `src/components/draft/TeamPanel.tsx`
- Modify: `src/components/captain/DraggableTeamBoard.tsx`
- Test: `src/components/captain/DraggableTeamBoard.test.tsx`

- [ ] Write a failing test for `DraggableTeamBoard` that hovers the own-team card and expects the team detail portal to show roster and budget.
- [ ] Run `npm test -- src/components/captain/DraggableTeamBoard.test.tsx` and confirm it fails.
- [ ] Wrap `TeamPanel` and `DraggableTeamBoard` with `TeamHoverCard`.
- [ ] Run the two focused tests and confirm they pass.

### Task 3: Final Verification

**Files:**
- Verify changed files only.

- [ ] Run `npm test -- src/components/draft/TeamCard.test.tsx src/components/captain/DraggableTeamBoard.test.tsx`.
- [ ] Run `npm run typecheck`.
- [ ] Start the dev server and visually verify the hover card on the known draft pages if local data/login state allows it.
