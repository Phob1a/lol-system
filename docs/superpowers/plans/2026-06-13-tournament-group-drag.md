# Tournament Group Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace setup-stage tournament group dropdowns with drag-and-drop team cards while keeping the existing save/confirm API contract.

**Architecture:** Extract group-assignment drag state transitions into a small pure helper, then let `GroupsTab` use `@dnd-kit/core` for card and slot drag/drop UI. The backend payload remains `assignments: { groupId, teamIds[] }[]`, so service semantics and match generation stay unchanged.

**Tech Stack:** Next.js React client component, `@dnd-kit/core`, Vitest unit/component tests, existing `/api/tournament/admin/groups` route.

---

### Task 1: Group Assignment Move Helper

**Files:**
- Create: `src/lib/tournament/group-assignment-drag.ts`
- Create: `src/lib/tournament/group-assignment-drag.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for pool-to-empty, pool-to-occupied, grouped-to-empty, grouped-to-occupied swap, and grouped-to-pool:

```ts
import { describe, expect, it } from 'vitest';
import { applyGroupDrop, getUnassignedTeamIds } from './group-assignment-drag';

describe('group assignment drag helpers', () => {
  it('derives unassigned teams from assignment slots', () => {
    expect(getUnassignedTeamIds(['t1', 't2', 't3'], [['t1', ''], ['t3', '']])).toEqual(['t2']);
  });

  it('assigns a pool team to an empty slot', () => {
    expect(applyGroupDrop([['', ''], ['', '']], { teamId: 't1', from: 'pool' }, { type: 'slot', groupIdx: 0, slotIdx: 1 })).toEqual([
      ['', 't1'],
      ['', ''],
    ]);
  });

  it('puts the previous occupant back into the pool when a pool team drops on an occupied slot', () => {
    expect(applyGroupDrop([['t2', ''], ['', '']], { teamId: 't1', from: 'pool' }, { type: 'slot', groupIdx: 0, slotIdx: 0 })).toEqual([
      ['t1', ''],
      ['', ''],
    ]);
  });

  it('moves a grouped team to an empty slot', () => {
    expect(applyGroupDrop([['t1', ''], ['', '']], { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 }, { type: 'slot', groupIdx: 1, slotIdx: 1 })).toEqual([
      ['', ''],
      ['', 't1'],
    ]);
  });

  it('swaps two grouped teams when dropping on an occupied slot', () => {
    expect(applyGroupDrop([['t1', ''], ['t2', '']], { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 }, { type: 'slot', groupIdx: 1, slotIdx: 0 })).toEqual([
      ['t2', ''],
      ['t1', ''],
    ]);
  });

  it('clears the source slot when dropping a grouped team back to the pool', () => {
    expect(applyGroupDrop([['t1', ''], ['t2', '']], { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 }, { type: 'pool' })).toEqual([
      ['', ''],
      ['t2', ''],
    ]);
  });
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npx vitest run src/lib/tournament/group-assignment-drag.test.ts --project unit`

Expected: FAIL because `group-assignment-drag.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

Create `applyGroupDrop()` and `getUnassignedTeamIds()` with the exact payload types used by the component.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npx vitest run src/lib/tournament/group-assignment-drag.test.ts --project unit`

Expected: PASS.

### Task 2: Drag Group UI Component Behavior

**Files:**
- Modify: `src/components/admin/tournament/GroupsTab.tsx`
- Create: `src/components/admin/tournament/GroupsTab.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test that the editable setup view renders an unassigned pool, fixed group slots, draggable team cards, no dropdowns, and that saving emits the existing payload shape after clicking a test-visible slot assignment fallback.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npx vitest run src/components/admin/tournament/GroupsTab.test.tsx --project component`

Expected: FAIL because the current component still renders dropdowns and no pool/slot test ids.

- [ ] **Step 3: Implement drag UI**

Update `GroupsTab`:
- import `DndContext`, `PointerSensor`, `useDraggable`, `useDroppable`, `useSensor`, `useSensors`;
- render an unassigned pool from `getUnassignedTeamIds`;
- render group cards with fixed slots;
- use `applyGroupDrop` in `onDragEnd`;
- remove editable dropdown controls;
- keep randomize/save/confirm behavior and payload shape unchanged.

- [ ] **Step 4: Run component tests and verify GREEN**

Run: `npx vitest run src/components/admin/tournament/GroupsTab.test.tsx --project component`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- No additional files.

- [ ] Run focused tests:

```bash
npx vitest run src/lib/tournament/group-assignment-drag.test.ts --project unit
npx vitest run src/components/admin/tournament/GroupsTab.test.tsx --project component
```

- [ ] Run full checks:

```bash
npm test
npm run typecheck
npm run build
```

- [ ] Report any pre-existing warnings separately from new failures.
