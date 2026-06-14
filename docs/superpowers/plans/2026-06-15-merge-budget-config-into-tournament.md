# Merge Budget Config Into Tournament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move current-tournament team budget editing from the standalone System Config page into Tournament Management.

**Architecture:** Keep the existing budget update API and backend validation. Extend the admin tournament read model with `teamBudget`, render a focused budget card inside `SetupTab`, and remove the standalone System Config navigation/page/component so there is one place to configure a tournament.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma read model, Vitest + React Testing Library.

---

## File Structure

- Modify `src/lib/tournament/read-model.ts`
  - Add `teamBudget` to the admin tournament state only.
- Modify `src/hooks/useTournamentState.ts`
  - Add `teamBudget: number` to `AdminState['tournament']`.
- Modify `src/lib/tournament/read-model.test.ts`
  - Assert admin state includes `teamBudget`.
- Modify `src/components/admin/tournament/SetupTab.tsx`
  - Add team budget card and save handler under current tournament settings.
- Create `src/components/admin/tournament/SetupTab.test.tsx`
  - Cover editable save and locked state.
- Modify `src/components/admin/tournament/GroupsTab.test.tsx` and `src/components/admin/tournament/ScheduleTab.test.tsx`
  - Add `teamBudget` to local `AdminState` fixtures after type change.
- Modify `src/components/layout/AppSidebar.tsx`
  - Remove `/admin/config` navigation entry.
- Modify `src/components/layout/AppSidebar.test.tsx`
  - Assert System Config is absent from desktop and mobile nav.
- Delete `src/app/admin/config/page.tsx`
  - Remove the standalone System Config route.
- Delete `src/components/admin/SeasonConfig.tsx`
  - Remove the old single-purpose component and stale `Season` naming.

## Task 1: Admin State Carries Team Budget

**Files:**
- Modify: `src/lib/tournament/read-model.ts`
- Modify: `src/hooks/useTournamentState.ts`
- Modify: `src/lib/tournament/read-model.test.ts`
- Modify: `src/components/admin/tournament/GroupsTab.test.tsx`
- Modify: `src/components/admin/tournament/ScheduleTab.test.tsx`

- [ ] **Step 1: Write the failing read-model expectation**

In `src/lib/tournament/read-model.test.ts`, update the existing admin-state test so it asserts `teamBudget`. The test currently checks config/version/games summary; extend that assertion:

```ts
expect(state?.tournament).toEqual(expect.objectContaining({
  id: tournamentId,
  name: expect.any(String),
  kind: expect.any(String),
  status: expect.any(String),
  teamBudget: 1000,
  config: expect.objectContaining({ template: 'group-knockout' }),
}));
```

If the local fixture uses a different budget value, use the value returned by the fixture setup instead of hardcoding. The assertion must prove `teamBudget` is present in the admin state.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run src/lib/tournament/read-model.test.ts
```

Expected: FAIL because admin state does not currently include `teamBudget`.

- [ ] **Step 3: Add `teamBudget` to admin read model**

In `src/lib/tournament/read-model.ts`, change the admin return object from:

```ts
tournament: { id: t.id, name: t.name, kind: t.kind, status: t.status, config: t.config },
```

to:

```ts
tournament: {
  id: t.id,
  name: t.name,
  kind: t.kind,
  status: t.status,
  teamBudget: t.teamBudget,
  config: t.config,
},
```

Do not add `teamBudget` to the public state unless a public component needs it. This feature is admin-only.

- [ ] **Step 4: Update admin state TypeScript type**

In `src/hooks/useTournamentState.ts`, change:

```ts
tournament: { id: string; name: string; kind: string; status: string; config: GroupKnockoutConfig };
```

to:

```ts
tournament: {
  id: string;
  name: string;
  kind: string;
  status: string;
  teamBudget: number;
  config: GroupKnockoutConfig;
};
```

- [ ] **Step 5: Update component test fixtures**

Add `teamBudget: 1000` to all local `AdminState` tournament fixtures in:

```text
src/components/admin/tournament/GroupsTab.test.tsx
src/components/admin/tournament/ScheduleTab.test.tsx
```

Example:

```ts
tournament: {
  id: 'tour-1',
  name: 'Summer',
  kind: 'STANDARD',
  status: 'GROUP_STAGE',
  teamBudget: 1000,
  config: {
    template: 'group-knockout',
    groupCount: 2,
    teamsPerGroup: 2,
    advancingPerGroup: 2,
    groupBestOf: 1,
    knockoutBestOf: { SEMIFINAL: 3, FINAL: 5 },
  },
},
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npx vitest run src/lib/tournament/read-model.test.ts src/components/admin/tournament/GroupsTab.test.tsx src/components/admin/tournament/ScheduleTab.test.tsx
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament/read-model.ts src/hooks/useTournamentState.ts src/lib/tournament/read-model.test.ts src/components/admin/tournament/GroupsTab.test.tsx src/components/admin/tournament/ScheduleTab.test.tsx
git commit -m "feat(tournament): expose team budget in admin state"
```

## Task 2: Add Team Budget Card To Tournament Settings

**Files:**
- Modify: `src/components/admin/tournament/SetupTab.tsx`
- Create: `src/components/admin/tournament/SetupTab.test.tsx`

- [ ] **Step 1: Write failing SetupTab tests**

Create `src/components/admin/tournament/SetupTab.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminState } from '@/hooks/useTournamentState';
import { SetupTab } from './SetupTab';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function state(status = 'REGISTRATION'): NonNullable<AdminState> {
  return {
    tournament: {
      id: 'tour-1',
      name: 'Summer',
      kind: '正赛',
      status,
      teamBudget: 1000,
      config: {
        template: 'group-knockout',
        groupCount: 2,
        teamsPerGroup: 4,
        advancingPerGroup: 2,
        groupBestOf: 1,
        knockoutBestOf: { SF: 3, FINAL: 5 },
      },
    },
    matches: [],
    bracket: [],
    standings: [],
  };
}

describe('SetupTab team budget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('updates team budget from tournament settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tournament: { id: 'tour-1', teamBudget: 1200 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<SetupTab tournamentId="tour-1" state={state()} refetch={refetch} />);

    fireEvent.change(screen.getByLabelText('队伍总费用'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: '保存队伍总费用' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tournament/tour-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamBudget: 1200 }),
    }));
    expect(refetch).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('队伍预算已更新');
  });

  it('locks team budget after drafting starts', () => {
    render(<SetupTab tournamentId="tour-1" state={state('DRAFTING')} refetch={vi.fn()} />);

    expect(screen.getByLabelText('队伍总费用')).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存队伍总费用' })).toBeDisabled();
    expect(screen.getByText(/队伍预算已锁定/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx vitest run src/components/admin/tournament/SetupTab.test.tsx
```

Expected: FAIL because `SetupTab` does not yet render team budget controls.

- [ ] **Step 3: Add imports and budget state**

In `src/components/admin/tournament/SetupTab.tsx`, add imports:

```ts
import { Input } from '@/components/ui/input';
import { BUDGET_EDITABLE_STATUSES } from '@/lib/tournament/tournament-service';
```

Add state near the existing edit form state:

```ts
const [budgetValue, setBudgetValue] = useState<string | null>(null);
const [savingBudget, setSavingBudget] = useState(false);
```

Inside the `if (state?.tournament)` branch, add:

```ts
const currentBudgetValue = budgetValue ?? String(t.teamBudget);
const budgetEditable = BUDGET_EDITABLE_STATUSES.includes(t.status);
const budgetDirty = currentBudgetValue !== String(t.teamBudget);
```

- [ ] **Step 4: Add budget save handler**

Inside the `if (state?.tournament)` branch in `SetupTab.tsx`, add this function after `handleSaveConfig`:

```ts
async function handleSaveBudget() {
  if (!state?.tournament) return;
  const value = Number(currentBudgetValue);
  if (!Number.isFinite(value) || value <= 0) {
    toast.error('预算必须大于 0');
    return;
  }

  setSavingBudget(true);
  try {
    const res = await fetch(`/api/tournament/${state.tournament.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamBudget: value }),
    });
    if (res.ok) {
      toast.success('队伍预算已更新');
      setBudgetValue(null);
      await refetch();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? '更新失败');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '更新失败');
  } finally {
    setSavingBudget(false);
  }
}
```

- [ ] **Step 5: Render budget card in current tournament settings**

In the current tournament branch return, place this block after the current tournament summary and before the existing “修改配置” section:

```tsx
<div className="space-y-4 max-w-xl rounded-md border p-4">
  <div className="space-y-1">
    <h2 className="text-sm font-semibold">队伍总费用</h2>
    <p className="text-xs text-muted-foreground">
      每支队伍的初始预算。选秀开始后该值会被锁定，因为各队剩余预算已基于它计算。
    </p>
  </div>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <div className="flex flex-col gap-1">
      <label htmlFor="team-budget" className="text-xs text-muted-foreground">
        队伍总费用
      </label>
      <Input
        id="team-budget"
        type="text"
        inputMode="decimal"
        className="w-48"
        value={currentBudgetValue}
        onChange={(e) => setBudgetValue(e.target.value)}
        disabled={!budgetEditable || savingBudget}
      />
    </div>
    <Button
      disabled={!budgetEditable || savingBudget || !budgetDirty}
      onClick={() => void handleSaveBudget()}
    >
      <LoadingButtonContent loading={savingBudget} loadingText="保存中…">
        保存队伍总费用
      </LoadingButtonContent>
    </Button>
  </div>
  {!budgetEditable && (
    <p className="text-xs text-amber-600">
      队伍预算已锁定（{t.status}），无法修改。
    </p>
  )}
</div>
```

- [ ] **Step 6: Run component tests**

Run:

```bash
npx vitest run src/components/admin/tournament/SetupTab.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run related tests**

Run:

```bash
npx vitest run src/components/admin/tournament/SetupTab.test.tsx src/lib/tournament/tournament-service.test.ts src/lib/registration/registration-service.test.ts
```

Expected: PASS. This confirms the UI uses existing budget rules and registration cost behavior remains separate.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/tournament/SetupTab.tsx src/components/admin/tournament/SetupTab.test.tsx
git commit -m "feat(ui): edit team budget in tournament settings"
```

## Task 3: Remove Standalone System Config Entry

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`
- Modify: `src/components/layout/AppSidebar.test.tsx`
- Delete: `src/app/admin/config/page.tsx`
- Delete: `src/components/admin/SeasonConfig.tsx`

- [ ] **Step 1: Extend sidebar test**

Modify `src/components/layout/AppSidebar.test.tsx` to assert System Config is gone. Add these expectations to the existing test after opening the mobile drawer:

```tsx
expect(screen.queryByRole('link', { name: '系统配置' })).not.toBeInTheDocument();
expect(screen.getAllByRole('link', { name: '赛事管理' })).toHaveLength(2);
```

The count is `2` because desktop and mobile nav are both rendered in the test DOM.

- [ ] **Step 2: Run sidebar test and verify it fails**

Run:

```bash
npx vitest run src/components/layout/AppSidebar.test.tsx
```

Expected: FAIL because System Config is still present.

- [ ] **Step 3: Remove nav entry**

In `src/components/layout/AppSidebar.tsx`, delete this item from `NAV`:

```ts
{ href: '/admin/config', label: '系统配置' },
```

- [ ] **Step 4: Delete obsolete files**

Delete:

```patch
*** Delete File: src/app/admin/config/page.tsx
*** Delete File: src/components/admin/SeasonConfig.tsx
```

These files become unreachable after the navigation removal and duplicate the new Tournament Management budget card. Removing them also clears the stale `SeasonConfig` naming.

- [ ] **Step 5: Scan for stale imports**

Run:

```bash
rg "SeasonConfig|/admin/config|系统配置" src
```

Expected: no matches outside tests that intentionally assert absence. If `AppSidebar.test.tsx` contains `系统配置`, that is acceptable.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npx vitest run src/components/layout/AppSidebar.test.tsx src/components/admin/tournament/SetupTab.test.tsx
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppSidebar.tsx src/components/layout/AppSidebar.test.tsx src/app/admin/config/page.tsx src/components/admin/SeasonConfig.tsx
git commit -m "feat(ui): remove standalone system config"
```

## Task 4: Full Verification And Spec Status

**Files:**
- Modify: `docs/superpowers/specs/2026-06-15-merge-budget-config-into-tournament-design.md`

- [ ] **Step 1: Mark spec implemented**

Change the header line in `docs/superpowers/specs/2026-06-15-merge-budget-config-into-tournament-design.md` from:

```markdown
日期：2026-06-15 ｜ 状态：draft（待用户复审）｜ 前置：赛事物理合一已上线，手动淘汰赛排位已上线
```

to:

```markdown
日期：2026-06-15 ｜ 状态：implemented ｜ 前置：赛事物理合一已上线，手动淘汰赛排位已上线
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npx vitest run \
  src/lib/tournament/read-model.test.ts \
  src/components/admin/tournament/SetupTab.test.tsx \
  src/components/layout/AppSidebar.test.tsx \
  src/components/admin/tournament/GroupsTab.test.tsx \
  src/components/admin/tournament/ScheduleTab.test.tsx \
  src/lib/tournament/tournament-service.test.ts \
  src/lib/registration/registration-service.test.ts
```

Expected: all listed test files PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected:

- `tsc`: exit 0.
- `vitest`: exit 0.
- `build`: exit 0. Existing React hook dependency warnings are acceptable if unchanged.

- [ ] **Step 4: Scan for removed route/component residue**

Run:

```bash
rg "SeasonConfig|/admin/config" src docs/superpowers/specs/2026-06-15-merge-budget-config-into-tournament-design.md
```

Expected: no `src` matches. The spec may mention `/admin/config` only as removed history.

- [ ] **Step 5: Commit spec status**

```bash
git add docs/superpowers/specs/2026-06-15-merge-budget-config-into-tournament-design.md
git commit -m "docs: mark budget config merge implemented"
```

## Self-Review Notes

- Spec coverage: Tasks cover removing the System Config menu, moving team budget into Tournament Management, preserving budget lock rules, keeping player costs in Registration Management, and documenting no schema/migration impact.
- Placeholder scan: no placeholder markers or undefined task handoffs remain.
- Type consistency: `AdminState.tournament.teamBudget` is introduced before `SetupTab` consumes it. Existing API `PATCH /api/tournament/[id]` remains the only budget write path.
- Scope check: This plan intentionally avoids redesigning Tournament Management layout or moving player-level costs.
