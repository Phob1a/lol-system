# design-sync notes — lol-system

## What is synced
This repo is a **Next.js application**, not a published component library. We sync
only the shadcn/ui primitives under `src/components/ui/` (16 components) as the
design system. Everything else in `src/components/` is app-feature code and is
out of scope.

## Off-script setup (important — not the default converter path)
- **No dist build exists.** We supply a scoped entry `.design-sync/entry.mjs`
  that `export *`s only the 16 `ui` files, passed via `--entry`. This keeps the
  bundle focused (the default synth-entry would pull in the whole app).
- `PKG_DIR` resolves to the repo root (entry walks up to `package.json` name
  `lol-system`), so `cfg.cssEntry` / `componentSrcMap` / `tsconfig` paths are
  repo-root-relative.
- Components are discovered purely from `cfg.componentSrcMap` (no `.d.ts` in the
  repo). `cfg.dtsPropsFor` hand-writes the `<Name>Props` for all 16 — **keep
  these in sync if the shadcn components' props change.**

## CSS — Tailwind, must be recompiled on every sync
- Styling lives in Tailwind utility classes. `cfg.cssEntry` points at
  `.design-sync/compiled.css`, which is **generated and gitignored**.
- **Before any build/re-sync, recompile it:**
  ```sh
  npx tailwindcss -c .design-sync/tailwind.config.ts -i src/app/globals.css -o .design-sync/compiled.css
  ```
  (`.design-sync/tailwind.config.ts` extends the repo config and widens
  `content` to include the previews.)
- No web fonts — Tailwind's default system font stack; no `@font-face`, so no
  `[FONT_MISSING]` is expected.

## Context-dependent previews (Form, Toaster)
- `cfg.extraEntries: ["react-hook-form", "sonner"]` merges those packages into
  the bundle in one esbuild pass so the previews can import `useForm` / `toast`
  **from `'lol-system'`** and share the same RHF context / sonner toast store as
  the shipped `Form` / `Toaster`. Importing them from their own packages in a
  preview would create a second instance and break context.

## Overlays / presentation overrides (`cfg.overrides`)
- `Dialog`, `AlertDialog`, `DropdownMenu`, `Select`, `Toaster` → `cardMode: single`
  (+ viewport) so the open/portal state renders inside the card.
- `Card`, `Table` → `cardMode: column` (wider than a grid cell).

## Known render warns (triaged — not new)
- **Toaster `[RENDER_THIN]` (0px measured height)** — benign. The toast is a
  fixed-position/portal element, so the measured root is 0px; the screenshot
  confirms the toast renders ("Team registered…", top-center).

## Re-sync risks (watch-list for the next run)
- `compiled.css` is gitignored — **recompile it first** or the build ships stale
  styles (or fails `[CSS_IMPORT_MISSING]`).
- `cfg.dtsPropsFor` is hand-maintained — it drifts if the shadcn components are
  re-generated/upgraded upstream. Re-read the sources if APIs changed.
- Adding a new `src/components/ui/*` component does **not** auto-include it — add
  it to `entry.mjs`, `cfg.componentSrcMap`, and `cfg.dtsPropsFor`.
- Form/Toaster correctness depends on the `extraEntries` single-instance dedup;
  re-check those two cards if the esbuild/bundling behavior changes.
- Preview content is illustrative tournament data (team names, records) — purely
  composition, no real data.
- Playwright chromium is pinned (headless shell 149 / chromium v1228) under
  `.ds-sync/`; a fresh clone must reinstall it for the render check.
