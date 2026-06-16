# UI Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every page/component still carrying the removed `tc-*` tactical theme (and the dark-hardcoded broadcast components) onto one consistent Tailwind + shadcn/ui **light** design system — a visual-only rewrite.

**Architecture:** Build a small set of shared shell/primitive components first (`AppSidebar`, `PageHeader`, `AuthCard`, two layouts), then rewrite the pages/components on top of them in 5 ordered groups. Every rewrite changes only JSX markup and `className`s — props, hooks, data flow, event handlers, SSE, `@dnd-kit`, `fetch`, and `toast` are preserved exactly.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind CSS, shadcn/ui, `next/navigation`.

**Spec:** `docs/superpowers/specs/2026-05-20-ui-rewrite-design.md`

---

## Design System Rules (apply in EVERY task)

These rules are the definition of "done" for styling. Every rewritten file must obey them:

1. **No `tc-*` classes**, no `className="corner …"`, no `var(--tc-*)`, no hard-coded hex/rgb colors, no color-bearing inline `style={{…}}`. (Geometry-only inline styles — e.g. a computed bar `width` percentage — are acceptable.)
2. **Use shadcn semantic tokens** via Tailwind classes: surfaces `bg-background` / `bg-card` / `bg-muted` / `bg-popover`; text `text-foreground` / `text-muted-foreground` / `text-card-foreground`; accents `bg-primary text-primary-foreground`, `bg-secondary`, `bg-accent`, `bg-destructive text-destructive-foreground` / `text-destructive`; borders `border` (border-border); rings `ring-ring`. Radius: `rounded-md` / `rounded-lg`. Spacing: Tailwind scale.
3. **Use the shadcn primitives** in `src/components/ui/`: `Button`, `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`), `Table` (+ parts), `Badge`, `Dialog`, `AlertDialog`, `Input`, `Label`, `Form` (+ parts), `Select`, `Checkbox`, `Tabs`, `Separator`, `DropdownMenu`. Import as `import { Button } from '@/components/ui/button'` etc.
4. **Behavior fidelity:** do NOT change any component's props, exported names, hooks (`useDraftStream`, react-hook-form, `@dnd-kit`), `fetch`/server-action calls, error handling, `router` usage, or `toast` calls. Only the rendered markup/classes change.
5. **No new dependencies.** Light theme only — no theme toggle, no `next-themes` wiring.
6. After every task: `npm run typecheck` must be zero-errors, and `npm run test` must stay 65/65 passing, before the commit step.

There is no automated UI test infrastructure; UI correctness is verified by typecheck + the 65-test regression guard + a manual browser note per task.

---

## Phase A — Shared Shell & Primitives

### Task 1: `PageHeader` component

**Files:** Create `src/components/layout/PageHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — Run `npm run typecheck 2>&1 | grep PageHeader || echo ok` → expect `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/PageHeader.tsx
git commit -m "feat(ui): PageHeader shared component"
```

---

### Task 2: `AuthCard` component

**Files:** Create `src/components/auth/AuthCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — Run `npm run typecheck 2>&1 | grep AuthCard || echo ok` → expect `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/AuthCard.tsx
git commit -m "feat(ui): AuthCard shared component"
```

---

### Task 3: `AppSidebar` component

**Files:** Create `src/components/layout/AppSidebar.tsx`

Context: this is the admin left navigation. The 6 admin routes are `/admin` (概览), `/admin/season` (赛季管理), `/admin/registrations` (报名管理), `/admin/teams` (队伍账号), `/admin/draft` (选秀控制台), `/admin/audit` (审计日志). The active item is determined by `usePathname()`.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: '概览' },
  { href: '/admin/season', label: '赛季管理' },
  { href: '/admin/registrations', label: '报名管理' },
  { href: '/admin/teams', label: '队伍账号' },
  { href: '/admin/draft', label: '选秀控制台' },
  { href: '/admin/audit', label: '审计日志' },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
      <div className="px-2 pb-3 text-sm font-semibold text-foreground">LoL 选人系统</div>
      {NAV.map((item) => {
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Note: `cn` is the shadcn class-merge helper at `src/lib/utils.ts` (used by all `ui/*` components — confirm it exists; it does in any shadcn project).

- [ ] **Step 2: Verify** — Run `npm run typecheck 2>&1 | grep AppSidebar || echo ok` → expect `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "feat(ui): AppSidebar admin navigation"
```

---

### Task 4: Rewrite `admin/layout.tsx`

**Files:** Modify `src/app/admin/layout.tsx`

- [ ] **Step 1: Read the current file** to see how it gets the session / current user and what it currently renders (it uses `AdminNav` and may show `session.user.username`).

- [ ] **Step 2: Rewrite it** to compose `AppSidebar` + a thin top strip + content area. The session/auth-fetch logic in the current file is preserved (keep whatever `getSession()` call and props it already does). New structure:

```tsx
// keep the existing imports for session/auth; add:
import { AppSidebar } from '@/components/layout/AppSidebar';

// the layout body becomes:
<div className="flex min-h-screen bg-background">
  <AppSidebar />
  <div className="flex flex-1 flex-col">
    <header className="flex h-14 items-center justify-between border-b px-6">
      <span className="text-sm text-muted-foreground">管理后台</span>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{/* current username, as the old file showed it */}</span>
        <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
      </div>
    </header>
    <main className="flex-1 p-6">{children}</main>
  </div>
</div>
```

Replace the `AdminNav` import/usage entirely. If the old file read `session.user.username` (or similar) for display, keep that exact data access. Do NOT change auth/redirect logic.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep 'admin/layout' || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(ui): admin shell with sidebar"
```

---

### Task 5: Rewrite `captain/layout.tsx`

**Files:** Modify `src/app/captain/layout.tsx`

- [ ] **Step 1: Read the current file** — note how it obtains the session / team name and any auth logic.

- [ ] **Step 2: Rewrite** to a minimal top bar + content area, preserving all session/auth logic:

```tsx
// keep existing session imports/logic; the body becomes:
<div className="flex min-h-screen flex-col bg-background">
  <header className="flex h-14 items-center justify-between border-b px-6">
    <span className="text-sm font-semibold text-foreground">LoL 选人系统</span>
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{/* team / username display as the old file did it */}</span>
      <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
    </div>
  </header>
  <main className="flex-1 p-6">{children}</main>
</div>
```

Remove the `CaptainNav` import/usage. Keep the exact data access the old file used for the team/username display.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep 'captain/layout' || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/captain/layout.tsx
git commit -m "feat(ui): captain shell with top bar"
```

---

## Phase B — Group 1: Auth Pages

### Task 6: Rewrite `LoginForm` + `login/page.tsx`

**Files:** Modify `src/components/auth/LoginForm.tsx`, `src/app/login/page.tsx`

- [ ] **Step 1: Read both files.** `LoginForm` currently uses `tc-*` classes + a custom `Field` sub-component + inline styles; it has `username`/`password` state, `signIn('credentials', …)`, error state, `callbackUrl` handling. `login/page.tsx` wraps `LoginForm` in `<Suspense>` and does the `getSession()` redirect.

- [ ] **Step 2: Rewrite `LoginForm.tsx`** — keep ALL logic (the `useState`s, `signIn` call, `callbackUrl`, `router.push`/`refresh`, error handling) byte-for-byte. Replace the markup: render the form fields with shadcn `Label` + `Input` and a shadcn `Button` (full-width, `type="submit"`, disabled while loading). Show the error with `<p className="text-sm text-destructive">`. Delete the custom `Field` sub-component (use `Label`+`Input` directly). The component no longer renders its own full-screen container — it returns just the `<form>` (the page wraps it in `AuthCard`).

- [ ] **Step 3: Rewrite `login/page.tsx`** — keep the `getSession()` redirect and `<Suspense>`. Wrap `LoginForm` in `<AuthCard title="登录" description="LoL 选人系统">`:

```tsx
return (
  <Suspense>
    <AuthCard title="登录">
      <LoginForm />
    </AuthCard>
  </Suspense>
);
```

(Import `AuthCard` from `@/components/auth/AuthCard`.)

- [ ] **Step 4: Verify** — `npm run typecheck 2>&1 | grep -E 'LoginForm|login/page' || echo ok` → `ok`. Browser: visit `/login`, confirm a clean centered card and that login still works.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/LoginForm.tsx src/app/login/page.tsx
git commit -m "feat(ui): rewrite login page on shadcn AuthCard"
```

---

### Task 7: Rewrite `ChangePasswordForm` + `change-password/page.tsx`

**Files:** Modify `src/components/auth/ChangePasswordForm.tsx`, `src/app/change-password/page.tsx`

- [ ] **Step 1: Read both files.** `ChangePasswordForm` has the password-change `fetch`, the `update({mustChangePwd:false})` session call, `router.push('/')`, a strength meter, and a `PwField` sub-component. `change-password/page.tsx` renders it inside `tc-*` markup.

- [ ] **Step 2: Rewrite `ChangePasswordForm.tsx`** — keep ALL logic (the `onSubmit` fetch, `update`, `router` calls, the `evalStrength` strength logic, `toast` calls). Replace markup: fields via `Label` + `Input` (`type="password"`); the strength meter as 4 small `<div>`s using `bg-primary` (filled) / `bg-muted` (empty) — keep the existing `strength` 0-4 logic, just swap the color classes to tokens. Submit `Button` full-width, disabled while submitting. Delete the `PwField` sub-component (use `Label`+`Input`). The component returns just the `<form>`.

- [ ] **Step 3: Rewrite `change-password/page.tsx`** — keep any auth logic; wrap the form in `<AuthCard title="修改密码" description="首次登录需修改初始密码">`.

- [ ] **Step 4: Verify** — `npm run typecheck 2>&1 | grep -E 'ChangePassword|change-password' || echo ok` → `ok`. Browser: visit `/change-password`, confirm clean card.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/ChangePasswordForm.tsx src/app/change-password/page.tsx
git commit -m "feat(ui): rewrite change-password page on shadcn AuthCard"
```

---

### Task 8: Rewrite `access-denied/page.tsx`

**Files:** Modify `src/app/access-denied/page.tsx`

- [ ] **Step 1: Read the current file.** It is a static page with `tc-*` markup, the denial message, and a "SIGN OUT" link to `/api/auth/signout`.

- [ ] **Step 2: Rewrite** using `AuthCard` and shadcn `Button`. Keep the message text exactly as it currently is (it was already corrected to a generic message). Keep the sign-out link to `/api/auth/signout`:

```tsx
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  return (
    <AuthCard title="访问被拒绝">
      <p className="text-sm text-muted-foreground">
        {/* keep the exact existing generic denial message text from the current file */}
      </p>
      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href="/api/auth/signout">登出</Link>
      </Button>
    </AuthCard>
  );
}
```

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep access-denied || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/app/access-denied/page.tsx
git commit -m "feat(ui): rewrite access-denied page on shadcn AuthCard"
```

---

## Phase C — Group 3: Overview & Audit

### Task 9: Rewrite `admin/page.tsx` (overview)

**Files:** Modify `src/app/admin/page.tsx`

- [ ] **Step 1: Read the current file.** It is a server component: fetches the active season + registration counts + season teamBudget, and renders overview cards / nav cards with `tc-*` markup.

- [ ] **Step 2: Rewrite the markup only.** Keep every data fetch (`getActiveSeason`, the `prisma.registration.count` calls, `season.teamBudget`) exactly. Render:
  - A `<PageHeader title="概览" description="赛事总览" />`.
  - The stats as a responsive grid of shadcn `Card`s (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), each `Card` with `CardHeader`/`CardTitle` (the metric label, `text-sm text-muted-foreground`) and `CardContent` (the metric value, `text-2xl font-semibold`).
  - If the current file has quick-link cards to `/admin/season` etc., render them as `Card`s wrapping a `Link`, or as `Button asChild variant="outline"`.
  - The no-active-season empty state: a `Card` or a `text-muted-foreground` line.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep 'admin/page' || echo ok` → `ok`. Browser: `/admin` renders clean cards.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(ui): rewrite admin overview with shadcn cards"
```

---

### Task 10: Rewrite `admin/audit/page.tsx`

**Files:** Modify `src/app/admin/audit/page.tsx`

- [ ] **Step 1: Read the current file.** Server component: loads the active season, queries `DraftEvent` (scoped to the season), renders an event log with `tc-*` markup.

- [ ] **Step 2: Rewrite the markup only.** Keep the `getActiveSeason` + `prisma.draftEvent.findMany` query and the no-season empty state exactly. Render:
  - `<PageHeader title="审计日志" description="当前赛季选秀事件流" />`.
  - The events in a shadcn `Table` (`Table`/`TableHeader`/`TableRow`/`TableHead`/`TableBody`/`TableCell`): columns seq, type, actor, time. Render the event `type` as a `Badge variant="secondary"`. Format the timestamp with `toLocaleString('zh-CN')`.
  - Empty state: a `text-muted-foreground` line.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep 'admin/audit' || echo ok` → `ok`. Browser: `/admin/audit` renders a clean table.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/audit/page.tsx
git commit -m "feat(ui): rewrite audit log with shadcn table"
```

---

## Phase D — Group 4: Draft Shared Components

### Task 11: Rewrite `BroadcastLayout`

**Files:** Modify `src/components/draft/BroadcastLayout.tsx`

- [ ] **Step 1: Read the current file.** It is the B-hybrid layout: props `{ pool, hero, grid, events, controls? }`; desktop = 3-column flex, mobile = pinned hero + shadcn `Tabs`. It currently uses `tc-*`/hex.

- [ ] **Step 2: Rewrite markup only.** Keep the exact prop interface and the desktop-3-column / mobile-Tabs structure. Swap styling to tokens: column separators `border`, panel surfaces `bg-card` where a panel needs a surface, the pinned mobile hero `bg-background`. The shadcn `Tabs` already render correctly. No structural/behavior change.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep BroadcastLayout || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/BroadcastLayout.tsx
git commit -m "feat(ui): re-theme BroadcastLayout to shadcn light"
```

---

### Task 12: Rewrite the broadcast cards — `OnTheClockHero`, `TeamCard`, `TeamGrid`, `EventStream`

**Files:** Modify `src/components/draft/OnTheClockHero.tsx`, `TeamCard.tsx`, `TeamGrid.tsx`, `EventStream.tsx`

- [ ] **Step 1: Read all four files.** They currently use hard-coded dark hex (`#0e1117`, cyan, etc.).

- [ ] **Step 2: Rewrite markup only**, preserving every prop and all derivation logic:
  - `OnTheClockHero`: the prominent banner → a `rounded-lg border bg-primary text-primary-foreground p-4` block for emphasis; pills → `Badge`; the muted "选秀未进行" state → `rounded-lg border bg-muted p-4 text-muted-foreground`.
  - `TeamCard`: `rounded-lg border bg-card p-3`; `live` state → add `ring-2 ring-primary`; the 5 position dots → filled `bg-primary` / empty `bg-muted`; the budget bar → track `bg-muted`, fill `bg-primary` (keep the existing computed `width` percentage inline style — geometry only).
  - `TeamGrid`: keep the responsive `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` and the `maxBudget`/`onTheClockId` logic; no color of its own.
  - `EventStream`: vertical list; first/newest item accented with `border-l-2 border-primary bg-accent`; rest `text-muted-foreground`; empty state `text-muted-foreground`.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep -E 'OnTheClockHero|TeamCard|TeamGrid|EventStream' || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/OnTheClockHero.tsx src/components/draft/TeamCard.tsx src/components/draft/TeamGrid.tsx src/components/draft/EventStream.tsx
git commit -m "feat(ui): re-theme broadcast cards to shadcn light"
```

---

### Task 13: Rewrite `PlayerPool`, `PlayerInfoCard`, `PlayerHoverCard`, `TeamPanel`

**Files:** Modify `src/components/draft/PlayerPool.tsx`, `PlayerInfoCard.tsx`, `PlayerHoverCard.tsx`, `TeamPanel.tsx`

- [ ] **Step 1: Read all four files.** They use `tc-*` classes and may import the `tactical/` components (`TcPlayerRow`, `TcBar`, `TcPos`, etc.).

- [ ] **Step 2: Rewrite markup only**, preserving every prop, filter/sort wiring, and any `renderActions` slot:
  - Replace any imported `tactical/*` component usage with inline shadcn/Tailwind markup (a player row → a flex row with `border-b`, name `text-foreground`, position/cost `text-muted-foreground`, a `Badge` for position; a bar → `bg-muted` track + `bg-primary` fill).
  - `PlayerPool`: list/table of registrations with the existing filter/sort controls re-rendered using `Input`/`Select`/`Checkbox`; picked entries dimmed with `opacity-50` or `text-muted-foreground`.
  - `PlayerInfoCard` / `PlayerHoverCard`: a `Card` surface (or shadcn `HoverCard` if `PlayerHoverCard` uses one) — only swap `tc-*`/hex to tokens.
  - Do not change `tactical/*` files themselves (they are deleted in Task 17 once unreferenced).

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep -E 'PlayerPool|PlayerInfoCard|PlayerHoverCard|TeamPanel' || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/PlayerPool.tsx src/components/draft/PlayerInfoCard.tsx src/components/draft/PlayerHoverCard.tsx src/components/draft/TeamPanel.tsx
git commit -m "feat(ui): re-theme player pool / team panel to shadcn light"
```

---

## Phase E — Group 5: Draft Consoles

### Task 14: Rewrite `DraftControl` (admin draft console)

**Files:** Modify `src/components/admin/DraftControl.tsx`

- [ ] **Step 1: Read the current file.** It renders the admin draft console via `BroadcastLayout` with a `controls` slot; uses `useDraftStream`, draft-operation `fetch` handlers, `RoundConfigDialog`, a confirm modal. It uses `tc-card`/`tc-board` markup for the controls panel.

- [ ] **Step 2: Rewrite markup only.** Keep every handler, `fetch` call, `useDraftStream(initialSnapshot)`, `RoundConfigDialog` usage, and the slot composition. Re-theme: the `controls` panel → `rounded-lg border bg-card p-4` with shadcn `Button`s for the operations (start draft / start round / rewind / reset / export — keep their handlers); the SSE-status indicator → a small `Badge` or a dot with `bg-primary`/`bg-muted`. The hero/grid/events/pool slots already receive the Task 11–13 rewritten components — pass them through unchanged.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep DraftControl || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DraftControl.tsx
git commit -m "feat(ui): re-theme admin draft console"
```

---

### Task 15: Rewrite the captain draft components

**Files:** Modify `src/components/draft/CaptainDashboard.tsx`, `src/components/captain/PickAction.tsx`, `src/components/captain/DraggableTeamBoard.tsx`, `src/components/captain/CaptainNotificationDialog.tsx`

- [ ] **Step 1: Read all four files.** `CaptainDashboard` composes the draft view for a captain (uses `useDraftStream`, the pool, team previews); `PickAction` is the pick confirm UI; `DraggableTeamBoard` uses `@dnd-kit` for slot drag-and-drop; `CaptainNotificationDialog` is a dialog.

- [ ] **Step 2: Rewrite markup only**, preserving EVERYTHING functional — especially the `@dnd-kit` wiring in `DraggableTeamBoard` (`DndContext`/`useDraggable`/`useDroppable`, `onDragEnd`, the `registrationId` payload) and the `useDraftStream` subscription in `CaptainDashboard`. Re-theme:
  - `CaptainDashboard`: compose via `BroadcastLayout` if it already does, else its own clean flex layout; surfaces `bg-card`/`border`.
  - `PickAction`: a `Card` or `Dialog`; confirm/cancel as shadcn `Button`s.
  - `DraggableTeamBoard`: slots as `rounded-md border` cells; the dragged item / drop-target highlight → `ring-2 ring-primary` / `bg-accent` (replace whatever `tc-*` highlight it used); keep the drag handlers byte-for-byte.
  - `CaptainNotificationDialog`: use shadcn `Dialog` parts; keep its open/close props and content logic.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep -E 'CaptainDashboard|PickAction|DraggableTeamBoard|CaptainNotificationDialog' || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/draft/CaptainDashboard.tsx src/components/captain/PickAction.tsx src/components/captain/DraggableTeamBoard.tsx src/components/captain/CaptainNotificationDialog.tsx
git commit -m "feat(ui): re-theme captain draft components"
```

---

### Task 16: Rewrite `SpectatorView`

**Files:** Modify `src/components/live/SpectatorView.tsx`

- [ ] **Step 1: Read the current file.** It is the public `/live` view: `useDraftStream` with the `/api/live/...` URLs, `SeasonSelector`, `BroadcastLayout` with hero/grid/events/pool, no controls slot.

- [ ] **Step 2: Rewrite markup only.** Keep the `useDraftStream` call (with its live opts), the `SeasonSelector` usage, the snapshot derivations, and the `BroadcastLayout` composition. Re-theme any `tc-*`/hex wrappers to tokens. The header row containing `SeasonSelector` → a `flex items-center justify-between` with a `text-lg font-semibold` title.

- [ ] **Step 3: Verify** — `npm run typecheck 2>&1 | grep SpectatorView || echo ok` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/SpectatorView.tsx
git commit -m "feat(ui): re-theme public spectator view"
```

---

## Phase F — Cleanup & Verification

### Task 17: Delete dead components & full verification

**Files:** Delete `src/components/tactical/*`, `src/components/layout/AdminNav.tsx`, `src/components/layout/CaptainNav.tsx`

- [ ] **Step 1: Confirm nothing imports the dead components.** Run:
  `grep -rn "components/tactical\|AdminNav\|CaptainNav" src/`
  Expect NO matches (Tasks 4, 5, 13, 15 removed all importers). If any match remains, fix that importer first (remove the leftover import line — the file should already be rewritten).

- [ ] **Step 2: Delete the dead files.**

```bash
git rm -r src/components/tactical
git rm src/components/layout/AdminNav.tsx src/components/layout/CaptainNav.tsx
```

- [ ] **Step 3: Full typecheck.** Run `npm run typecheck` — expect ZERO errors. Fix any straggler (a missed `tc-*` reference, a dangling import).

- [ ] **Step 4: Full test run.** Run `npm run test` — expect 65/65 passing.

- [ ] **Step 5: Confirm no `tc-*` remains.** Run:
  `grep -rn "tc-board\|tc-card\|tc-btn\|tc-h1\|tc-label\|tc-mono\|tc-divider\|--tc-\|className=\"corner" src/`
  Expect NO matches.

- [ ] **Step 6: Full browser smoke test** on the running dev server (`http://localhost:3000`): `/login`, `/change-password`, `/access-denied`, `/admin` + each admin page, `/captain`, `/live`. Each renders cleanly on the light theme and its feature still works.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(ui): remove dead tactical components, finalize UI rewrite"
```

---

## Self-Review Notes

- **Spec coverage:** §3 shared shell → Tasks 1–5; §4 Group 1 → Tasks 6–8; Group 3 → Tasks 9–10; Group 4 → Tasks 11–13; Group 5 → Tasks 14–16; deletions + §5 verification → Task 17.
- **Behavior fidelity** is Design System Rule 4, repeated in every rewrite task ("rewrite markup only", "preserve every prop/handler/hook").
- **Ordering:** shared primitives (1–3) before layouts (4–5) before pages; Group 4 components before Group 5 consoles that compose them; deletions last (Task 17) once all importers are rewritten.
- **No automated UI tests** exist; verification is `npm run typecheck` (zero errors) + `npm run test` (65/65 regression guard) + a per-task browser note. This matches spec §5.
- **`cn` helper** (Task 3) lives at `src/lib/utils.ts` — standard in shadcn projects, used by every `ui/*` primitive.
- **Group 4 before Group 5:** the draft consoles (DraftControl, CaptainDashboard, SpectatorView) compose the broadcast/pool components, so Tasks 11–13 land first.
