# Draft UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two draft-flow UI bugs — (1) admin "round mode" Select dropdown is hidden behind the dialog, and (2) hovering a team position on the captain dashboard does nothing instead of showing the picked player's card.

**Architecture:**
1. Bump `SelectContent` z-index from `z-50` to `z-[60]` so it stacks above Radix Dialog content.
2. Add a self-contained `PlayerHoverCard` component (mouseenter/leave + delayed open + portal to `<body>`) that wraps any trigger row and renders the existing `PlayerInfoCard` as a floating tooltip. Wire it into `TeamPanel` (read-only other teams) and `DraggableTeamBoard` (own team, with explicit drag-start dismiss).

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind, Radix UI primitives, dnd-kit (existing). No new dependencies.

**Commits:** This repo currently has **no initial commit**. The first task below assumes the executor will create an initial commit (or commit alongside the spec file) before running per-task commits. If the working tree is dirty with unrelated untracked files, the executor should either (a) make an initial commit covering the existing project, or (b) use `git add` with explicit file paths to commit only this task's changes. Each task's `git add` uses explicit paths to stay safe in either case.

---

## File Structure

| File | Role |
|---|---|
| `src/components/ui/select.tsx` | Modify: bump `SelectContent` z-index. |
| `src/components/draft/PlayerHoverCard.tsx` | **Create** (~80 lines): controlled hover-card with portal + boundary flip. |
| `src/components/draft/TeamPanel.tsx` | Modify: wrap filled position rows with `PlayerHoverCard`. |
| `src/components/captain/DraggableTeamBoard.tsx` | Modify: wrap filled position rows in `DroppableSlot`, pass `disabled` through. |

No automated tests in this plan; spec explicitly waives them. Verification is a final manual browser pass (Task 5).

---

## Task 1: Fix Select z-index in Dialog (Bug 1)

**Files:**
- Modify: `src/components/ui/select.tsx`

- [ ] **Step 1: Read the current SelectContent className**

Run: `grep -n "z-50" src/components/ui/select.tsx`

Expected: one match around line 80 inside `SelectContent`'s `cn(...)` className list, in this string fragment:
```
"relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] ..."
```

- [ ] **Step 2: Change `z-50` to `z-[60]` only inside `SelectContent`**

Use Edit with old_string scoped enough to be unique. Old:
```
"relative z-50 max-h-[--radix-select-content-available-height]
```
New:
```
"relative z-[60] max-h-[--radix-select-content-available-height]
```

Do NOT touch any other `z-50` occurrence (there should be none in this file, but verify).

- [ ] **Step 3: Confirm only one substitution happened**

Run: `grep -n "z-50\|z-\[60\]" src/components/ui/select.tsx`

Expected: a single line containing `z-[60]`, no remaining `z-50`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0. (No type changes were made; this is a sanity check.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/select.tsx
git commit -m "fix(ui): raise SelectContent z-index above Dialog (z-50 -> z-[60])

Radix SelectContent and DialogContent both use z-50, causing the
round-config mode dropdown to render below the dialog. Bumping
Select to z-[60] keeps it above any dialog while still below toasts."
```

---

## Task 2: Create `PlayerHoverCard` component (Bug 2 — primitive)

**Files:**
- Create: `src/components/draft/PlayerHoverCard.tsx`

- [ ] **Step 1: Verify dependencies and types**

Run:
```bash
grep -n "export type PlayerRef" src/lib/teams/preview.ts
test -f src/components/draft/PlayerInfoCard.tsx && echo "PlayerInfoCard ok"
```

Expected:
```
4:export type PlayerRef = Pick<
PlayerInfoCard ok
```

This confirms `PlayerRef` is exported from `@/lib/teams/preview` and `PlayerInfoCard` exists at `@/components/draft/PlayerInfoCard`.

- [ ] **Step 2: Create the file with the full component**

Write the entire content of `src/components/draft/PlayerHoverCard.tsx`:

```tsx
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerRef } from '@/lib/teams/preview';
import { PlayerInfoCard } from '@/components/draft/PlayerInfoCard';

const OPEN_DELAY_MS = 150;
const GAP = 8;
const FALLBACK_CARD_WIDTH = 280;

type Props = {
  player: PlayerRef;
  /** When true, suppresses hover entirely and force-closes any open card. */
  disabled?: boolean;
  children: React.ReactNode;
};

type Coords = { top: number; left: number };

export function PlayerHoverCard({ player, disabled, children }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function close() {
    clearTimer();
    setOpen(false);
  }

  function computeCoords(rect: DOMRect, cardWidth: number, cardHeight: number): Coords {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + GAP;
    if (left + cardWidth > vw - GAP) {
      left = rect.left - cardWidth - GAP;
    }
    if (left < GAP) left = GAP;

    let top = rect.top;
    if (cardHeight > 0 && top + cardHeight > vh - GAP) {
      top = vh - cardHeight - GAP;
    }
    if (top < GAP) top = GAP;
    return { top, left };
  }

  function handleMouseEnter() {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    clearTimer();
    timerRef.current = setTimeout(() => {
      setCoords(computeCoords(rect, FALLBACK_CARD_WIDTH, 0));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }

  function handleMouseLeave() {
    close();
  }

  function handlePointerDown() {
    // Drag start (dnd-kit) or any click — dismiss immediately.
    close();
  }

  // If parent flips disabled true mid-hover, force-close.
  useEffect(() => {
    if (disabled) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // After portal render, measure real card size and refine position.
  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    const card = cardRef.current;
    if (!el || !card) return;
    const rect = el.getBoundingClientRect();
    const next = computeCoords(rect, card.offsetWidth, card.offsetHeight);
    setCoords((cur) =>
      cur && cur.top === next.top && cur.left === next.left ? cur : next,
    );
  }, [open]);

  // Cleanup any pending timer on unmount.
  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        style={{ display: 'contents' }}
      >
        {children}
      </span>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={cardRef}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 70,
                pointerEvents: 'none',
              }}
            >
              <PlayerInfoCard player={player} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

Notes for the implementer:
- `display: 'contents'` on the wrapper `<span>` makes it layout-invisible — children render exactly where they were.
- The wrapper is a `<span>` (inline), not a `<div>`, because `TeamPanel`/`DroppableSlot` rows use `display: grid` with explicit `gridTemplateColumns`; an extra block-level wrapper would break the grid.
- `pointerEvents: 'none'` on the floating card prevents flicker when the card overlaps the trigger; the trigger's mouseleave is the sole exit signal.
- `useLayoutEffect` runs synchronously after portal render, so the user only sees one paint with the corrected position.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0.

- [ ] **Step 4: Lint (best-effort)**

Run: `npx next lint --file src/components/draft/PlayerHoverCard.tsx`

Expected: no errors. Warnings about `useEffect` deps are fine (the eslint-disable is intentional — disabling on `disabled` change should not depend on `close`/`clearTimer`).

If `next lint` flags an issue you can't quickly resolve without changing semantics, note it and continue. Do not introduce additional deps to silence linters.

- [ ] **Step 5: Commit**

```bash
git add src/components/draft/PlayerHoverCard.tsx
git commit -m "feat(draft): add PlayerHoverCard for position-row tooltips

Self-contained hover card that wraps a trigger and portals a
PlayerInfoCard to body on mouseenter (150ms delay). Closes on
mouseleave and pointerdown (so dnd-kit drag start dismisses it).
Position defaults to the right of the trigger with viewport-edge
flip to the left when there isn't room."
```

---

## Task 3: Integrate `PlayerHoverCard` into `TeamPanel` (other teams)

**Files:**
- Modify: `src/components/draft/TeamPanel.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/draft/TeamPanel.tsx`, add the import next to the existing imports.

Current imports block:
```tsx
'use client';

import type { TeamPreview } from '@/lib/teams/preview';
import { TcPos } from '@/components/tactical/TcPos';
import { POSITION_LABEL } from '@/components/players/positions';
```

Use Edit to insert one new line after the `POSITION_LABEL` import. Old:
```
import { TcPos } from '@/components/tactical/TcPos';
import { POSITION_LABEL } from '@/components/players/positions';
```
New:
```
import { TcPos } from '@/components/tactical/TcPos';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
```

- [ ] **Step 2: Wrap filled rows with `PlayerHoverCard`**

Locate the slot map (lines 67-110, the block starting `{team.slots.map((slot) => (`).

Replace the entire `team.slots.map(...)` block. Old:
```tsx
        {team.slots.map((slot) => (
          <div
            key={slot.position}
            style={{
              display: 'grid',
              gridTemplateColumns: '46px 1fr auto',
              gap: 8,
              alignItems: 'center',
              padding: '4px 6px',
              background: slot.player ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
              border: '1px solid var(--tc-line)',
              fontSize: 11,
            }}
          >
            <span className="tc-label" style={{ fontSize: 9 }}>
              {POSITION_LABEL[slot.position]}
            </span>
            {slot.player ? (
              <span
                style={{
                  minWidth: 0,
                  fontFamily: 'var(--tc-font-display)',
                  color: 'var(--tc-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {slot.player.nickname}
                <span className="tc-mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--tc-text-faint)' }}>
                  @{slot.player.gameId}
                </span>
              </span>
            ) : (
              <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
            )}
            <span
              className="tc-num"
              style={{ fontSize: 11, color: slot.player ? 'var(--tc-amber)' : 'var(--tc-text-faint)' }}
            >
              {slot.player ? slot.player.cost : '—'}
            </span>
          </div>
        ))}
```

New:
```tsx
        {team.slots.map((slot) => {
          const row = (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '46px 1fr auto',
                gap: 8,
                alignItems: 'center',
                padding: '4px 6px',
                background: slot.player ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
                border: '1px solid var(--tc-line)',
                fontSize: 11,
              }}
            >
              <span className="tc-label" style={{ fontSize: 9 }}>
                {POSITION_LABEL[slot.position]}
              </span>
              {slot.player ? (
                <span
                  style={{
                    minWidth: 0,
                    fontFamily: 'var(--tc-font-display)',
                    color: 'var(--tc-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {slot.player.nickname}
                  <span className="tc-mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--tc-text-faint)' }}>
                    @{slot.player.gameId}
                  </span>
                </span>
              ) : (
                <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
              )}
              <span
                className="tc-num"
                style={{ fontSize: 11, color: slot.player ? 'var(--tc-amber)' : 'var(--tc-text-faint)' }}
              >
                {slot.player ? slot.player.cost : '—'}
              </span>
            </div>
          );
          return slot.player ? (
            <PlayerHoverCard key={slot.position} player={slot.player}>
              {row}
            </PlayerHoverCard>
          ) : (
            <div key={slot.position}>{row}</div>
          );
        })}
```

Key changes:
- `key` moves out of the inner `<div>` and onto the returned wrapper (`<PlayerHoverCard>` or the outer `<div>`).
- Empty slots are wrapped in a plain `<div key={slot.position}>` to keep the React key stable; visual is unchanged because the inner `row` `<div>` retains all original styles.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/TeamPanel.tsx
git commit -m "feat(draft): show player hover card on TeamPanel position rows

Wraps each filled position row with PlayerHoverCard so captains can
quickly inspect the picked player on other teams without leaving
the dashboard."
```

---

## Task 4: Integrate `PlayerHoverCard` into `DraggableTeamBoard` (own team)

**Files:**
- Modify: `src/components/captain/DraggableTeamBoard.tsx`

- [ ] **Step 1: Add the import**

Current imports:
```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { TeamPreview, PlayerRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
```

Use Edit. Old:
```
import type { TeamPreview, PlayerRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
```
New:
```
import type { TeamPreview, PlayerRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
```

- [ ] **Step 2: Wrap `DraggablePlayer` with `PlayerHoverCard` inside `DroppableSlot`**

Locate the `DroppableSlot` function (around line 123-162). Find the section that conditionally renders `DraggablePlayer`:

Old:
```tsx
      {slot.player ? (
        <DraggablePlayer slot={slot} disabled={disabled} />
      ) : (
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
      )}
```

New:
```tsx
      {slot.player ? (
        <PlayerHoverCard player={slot.player} disabled={disabled}>
          <DraggablePlayer slot={slot} disabled={disabled} />
        </PlayerHoverCard>
      ) : (
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
      )}
```

Notes:
- `disabled` here is the existing `submitting` state passed into `DroppableSlot` from the parent. While a slot-edit POST is in flight, hover is suppressed.
- `PlayerHoverCard`'s own `onPointerDown` listener handles the drag-start dismissal independent of `disabled`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/captain/DraggableTeamBoard.tsx
git commit -m "feat(draft): show player hover card on own team slots

Wraps each filled DraggablePlayer with PlayerHoverCard. Drag start
dismisses the card via onPointerDown, and the existing 'submitting'
flag is forwarded as 'disabled' so hover is suppressed during slot
persistence."
```

---

## Task 5: Manual verification

No code changes in this task. Run the spec's manual verification clauses against a live dev server.

**Files:** none modified.

- [ ] **Step 1: Start dev server**

Run (in a separate terminal): `npm run dev`

Expected: server boots on `http://localhost:3000` (or the port your env reports). Watch the console for compile errors involving `PlayerHoverCard`, `select.tsx`, `TeamPanel`, or `DraggableTeamBoard`. Any of these blocks the rest of this task.

- [ ] **Step 2: Bug 1 verification — admin Select dropdowns**

Sign in as an admin (refer to `README.md` or `init.sh` for default credentials).

1. Start a draft (or use an existing in-progress draft).
2. When `START ROUND N` is enabled, click it.
3. In the round dialog, click the **「模式」** Select. **All four options must be fully visible** and clickable: 管理员定序 / 上轮逆序 / 按剩余预算降序 / 管理员指派.
4. Switch to `MANUAL`. For each captain row, both the player Select and position Select must open and be clickable.
5. Resize the browser window to ~800×600 and repeat 3-4. Dropdowns must still render above the dialog.

If any dropdown is clipped/hidden behind the dialog, **the fix is incomplete** — re-check Task 1.

- [ ] **Step 3: Bug 2 verification — captain hover card**

Sign in as a captain (any non-admin captain account).

1. With the draft `IN_PROGRESS`, navigate to the captain dashboard.
2. Hover over a filled position on **your own team**. After ~150ms a `PlayerInfoCard` should appear to the right (or left if right is clipped). Move the mouse away — card disappears immediately.
3. Hover over a filled position on **another team**. Same behavior.
4. Hover over an **empty position row** (`— empty —`). No card should appear.
5. **Drag** a filled own-team position into another. Card must disappear the instant the drag begins (pointerdown) and stay hidden until release.
6. Resize the window so a hovered row's right side is near the viewport edge. Card must flip to the **left**.
7. Scroll the page (if the dashboard is taller than viewport) and hover. Card position must align with the visible row (fixed positioning, not page-coordinate stale).

- [ ] **Step 4: Regression scan**

Run: `grep -rn "<Select" src/`

Expected: matches in `ConfigForm.tsx`, `PlayerFormDialog.tsx`, `RoundConfigDialog.tsx` (and possibly elsewhere). Spot-check at least one non-dialog Select (e.g. on `/admin/config`) to confirm it still opens normally.

- [ ] **Step 5: Mark plan complete**

If all checks pass, no further commit is needed for this task. Tell the user the plan is complete and summarize what was changed (the four files in `File Structure`).

If a check fails, report which one and which task's commit to revisit. Do NOT silently amend — return to the failing task.

---

## Self-Review Notes

- **Spec coverage:** Bug 1 → Task 1. Bug 2 component → Task 2. Bug 2 integration in TeamPanel → Task 3. Bug 2 integration in DraggableTeamBoard → Task 4. Manual verification clauses → Task 5. Out-of-scope items (no admin hover, no Radix HoverCard, no unit tests, no a11y) are honored.
- **Placeholder scan:** No TBD/TODO. All edits include the exact old/new strings and complete code. The `PlayerHoverCard` component file is shown in full in Task 2 Step 2.
- **Type consistency:** `PlayerRef` is imported from `@/lib/teams/preview` consistently in Tasks 2 and 4 (Task 4 already had it). `PlayerInfoCard` is imported from `@/components/draft/PlayerInfoCard` (matches existing file). Component name `PlayerHoverCard` is identical across Tasks 2/3/4.
