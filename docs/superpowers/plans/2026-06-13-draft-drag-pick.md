# Draft Drag Pick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-pick from player pool into the captain's own empty slot, with confirmation before submission. Remove the visible `PICK` button so drag-to-slot is the primary mental model; keep double-click/double-tap on a card as the fallback confirmation entry.

**Architecture:** Keep backend draft semantics unchanged. Extend `PlayerPool` to render optional draggable cards, extend `DraggableTeamBoard` to expose optional external drop slots, and let `CaptainDashboard` coordinate a shared DnD context that opens `PickAction` with a preselected position.

**Tech Stack:** Next.js React components, `@dnd-kit/core`, Vitest component tests, existing `/api/draft/pick`.

---

### Task 1: Confirmation Dialog Preset

**Files:**
- Modify: `src/components/captain/PickAction.tsx`
- Modify: `src/components/captain/PickAction.test.tsx`

- [ ] Add `initialPosition?: Position` to `PickAction`.
- [ ] Initialize/reset local `position` from `initialPosition` when dialog opens.
- [ ] Test that the initial position radio is selected.

### Task 2: Drag Affordances

**Files:**
- Modify: `src/components/draft/PlayerPool.tsx`
- Modify: `src/components/draft/PlayerPool.test.tsx`
- Modify: `src/components/captain/DraggableTeamBoard.tsx`
- Modify: `src/components/captain/DraggableTeamBoard.test.tsx`

- [ ] Add optional `getDragData(player)` to `PlayerPool`; when it returns data, wrap the card with `useDraggable`.
- [ ] Keep non-draggable behavior identical when `getDragData` is absent.
- [ ] Add optional `pickDropEnabled` to `DraggableTeamBoard`; empty slots should show drop hints only when enabled.
- [ ] Test visible drag/drop affordances.

### Task 3: Dashboard Coordination

**Files:**
- Modify: `src/components/draft/CaptainDashboard.tsx`

- [ ] Wrap the captain dashboard body in a DnD context when draft state is present.
- [ ] On pool-card drop over own empty slot, set `pickTarget` and `pickInitialPosition`.
- [ ] Pass `initialPosition` to `PickAction`.
- [ ] Remove the visible `PICK` button and wire eligible-card double-click/double-tap to open `PickAction` without a preselected position.

### Task 4: Verification

- [ ] Run `npx vitest run src/components/captain/PickAction.test.tsx src/components/draft/PlayerPool.test.tsx src/components/captain/DraggableTeamBoard.test.tsx --project component`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
