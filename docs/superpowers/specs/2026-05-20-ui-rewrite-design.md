# UI Rewrite Design — shadcn Light Theme

**Status:** Approved (brainstorming)
**Date:** 2026-05-20
**Author:** lixuan.dai (with Claude)
**Scope:** Rewrite the components/pages that still carry the removed `tc-*` "tactical" theme (and the dark-hardcoded broadcast components) onto a single, consistent Tailwind + shadcn/ui light design system. Visual-only rewrite — no behavior, data, routing, or API changes.

---

## 1. Background & Goal

The `tc-*` tactical theme layer (`src/styles/tactical.css`) was removed in a prior change. ~22 files still reference its now-inert classes/CSS variables and render as messy, near-unstyled HTML. Separately, the draft "broadcast" components use hard-coded dark hex colors that clash with the rest of the app.

**Goal:** every page renders clean and consistent on one design system — Tailwind + shadcn/ui defaults, **light theme**.

**Non-goals:** no theme toggle / dark mode, no new dependencies, no bespoke design system, no behavior/logic/route/API changes, no redesign of pages already on clean shadcn.

---

## 2. Captured Decisions

| Decision | Choice |
|---|---|
| Color theme | Light — shadcn defaults (the `:root` tokens already in `globals.css`). No dark mode, no toggle. |
| Scope | (a) the 22 `tc-*`-using files **and** (b) the dark-hardcoded broadcast components — re-themed to shadcn light. Already-clean shadcn admin pages are left untouched. |
| Admin app shell | Left sidebar (brand strip on top + fixed left nav for the 6 admin pages). |
| Captain app shell | Minimal top bar (brand + team name + sign out). |
| Execution approach | Build shared shell/primitives first, then rewrite pages on top of them (consistency is structural, not per-page convention). |

---

## 3. Architecture — Shared Shell & Primitives

Build a small set of focused shared components first; every rewritten page composes them.

| Component | Location | Responsibility |
|---|---|---|
| `AppSidebar` | `src/components/layout/AppSidebar.tsx` | Admin left nav — brand + 6 links (概览 / 赛季管理 / 报名管理 / 队伍账号 / 选秀控制台 / 审计日志), active item highlighted (`usePathname`). |
| `admin/layout.tsx` | `src/app/admin/layout.tsx` | Composes a thin top strip (page-area title + current user + sign out) + `AppSidebar` + content area. |
| `captain/layout.tsx` | `src/app/captain/layout.tsx` | Minimal top bar (brand + team name + sign out) + content area. |
| `PageHeader` | `src/components/layout/PageHeader.tsx` | Page-level header: `title`, optional `description`, optional right-aligned `actions` slot. Used by every admin page. |
| `AuthCard` | `src/components/auth/AuthCard.tsx` | Centered card container reused by `login`, `change-password`, `access-denied`. |

The old `AdminNav` and `CaptainNav` are replaced by `AppSidebar` / the captain top bar and **deleted**. The `src/components/tactical/` components (`TcCard`, `TcBar`, `TcPos`, `TcPlayerRow`, `HudTimer`) are **deleted** once the draft UI no longer imports them.

---

## 4. Page Groups & Rewrite

The work is 5 ordered groups. **Every rewrite changes only JSX markup and `className`s** (`tc-*` / hard-coded hex → shadcn primitives + Tailwind tokens). Props, data fetching, event handlers, SSE (`useDraftStream`), `@dnd-kit` drag-and-drop, pick validation, form submission, `fetch` calls, and `toast` usage are preserved exactly.

| Group | Files | Rewritten as |
|---|---|---|
| **1 · Auth pages** | `app/login/page.tsx`, `app/change-password/page.tsx`, `app/access-denied/page.tsx`, `components/auth/LoginForm.tsx`, `components/auth/ChangePasswordForm.tsx` | Centered `AuthCard` + shadcn `Form`/`Input`/`Button`. |
| **2 · Shells & nav** | `app/admin/layout.tsx`, `app/captain/layout.tsx`, `components/layout/AdminNav.tsx`, `components/layout/CaptainNav.tsx` | §3 `AppSidebar` + captain top bar. Old `AdminNav`/`CaptainNav` deleted. |
| **3 · Overview & audit** | `app/admin/page.tsx`, `app/admin/audit/page.tsx` | `PageHeader` + shadcn `Card`/`Table`/`Badge`. |
| **4 · Draft shared components** | `components/draft/BroadcastLayout.tsx`, `OnTheClockHero.tsx`, `TeamCard.tsx`, `TeamGrid.tsx`, `EventStream.tsx`, `PlayerPool.tsx`, `PlayerInfoCard.tsx`, `PlayerHoverCard.tsx`, `TeamPanel.tsx` | shadcn light tokens (`bg-card`, `border`, `text-muted-foreground`, `bg-primary`, etc.) replacing `tc-*` classes and hard-coded dark hex. Layout structure (incl. the B-hybrid three-column) unchanged. |
| **5 · Draft consoles** | `components/admin/DraftControl.tsx`, `components/draft/CaptainDashboard.tsx`, `components/captain/PickAction.tsx`, `DraggableTeamBoard.tsx`, `CaptainNotificationDialog.tsx`, `components/live/SpectatorView.tsx` | Compose the rewritten Group 4 components. B-hybrid layout retained. |

**Deleted:** `src/components/tactical/*` (5 components), `AdminNav`, `CaptainNav` — once unreferenced.

**Untouched (already clean shadcn):** `SeasonManager`, `RegistrationsManager`, `TeamsManager`, `RegistrationForm`, `RoundConfigDialog`, `SeasonSelector`, `error.tsx`, `not-found.tsx`, `src/components/ui/*`.

---

## 5. Behavior Fidelity & Verification

**Fidelity constraint:** this is a visual rewrite. For every rewritten file, the component's props, data flow, hooks (`useDraftStream`, react-hook-form, `@dnd-kit`), `fetch`/server-action calls, error handling, and `toast` behavior must be equivalent in effect. Only `className`s and JSX structure-for-styling change.

**Theme:** light only. `globals.css` `:root` already defines the shadcn light tokens — use them directly. No theme toggle, no `next-themes` wiring added.

**Verification per group:**
- `npm run typecheck` — zero errors (props unchanged → types pass).
- `npm run test` — still 65/65 (existing tests cover services + pure functions, not UI; they act as a regression guard that the rewrite did not break imports/types).
- Browser smoke test on the running dev server: each rewritten page renders cleanly and its feature still works (login → admin pages → draft → `/live`).

**Order:** Group 1→5 as listed (shared shell first, then pages, then draft consoles which depend on Group 4). Each group is independently verifiable.

---

## 6. Out of Scope / Future

- Dark mode / theme toggle.
- Visual polish beyond "clean and consistent" (animations, bespoke illustrations).
- Restyling the already-clean shadcn admin pages.
- Any functional or data-model change.
