# Public Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/` with a lightweight public portal that links to registration, tournament schedule/data, live draft, and login while preserving protected admin/captain routes.

**Architecture:** Keep data decisions in a pure helper, render the homepage through a small reusable component, and make `src/app/page.tsx` a server page that only loads low-sensitive season/tournament status. Update middleware so `/` is public and no longer role-redirects logged-in users.

**Tech Stack:** Next.js 15 App Router, Prisma, React 18, Tailwind/shadcn UI primitives, Vitest unit/component projects.

---

## File Map

- Create `src/lib/home/public-home.ts`: pure homepage view-model helpers, no database imports.
- Create `src/lib/home/public-home.test.ts`: unit tests for entrance ordering and status copy.
- Create `src/components/home/PublicHomePage.tsx`: presentational homepage component.
- Create `src/components/home/PublicHomePage.test.tsx`: component tests for links and emphasized entry.
- Modify `src/app/page.tsx`: replace redirect with server-side data load and render `PublicHomePage`.
- Modify `src/middleware.ts`: mark `/` public and remove the root role redirect.

---

### Task 1: Public Homepage View Model

**Files:**
- Create: `src/lib/home/public-home.ts`
- Create: `src/lib/home/public-home.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/lib/home/public-home.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHomeEntries, getSeasonStatusText, type PublicHomeContext } from './public-home';

function ctx(overrides: Partial<PublicHomeContext> = {}): PublicHomeContext {
  return {
    season: { name: '夏季赛', status: 'REGISTRATION' },
    tournament: { status: 'SETUP' },
    ...overrides,
  };
}

describe('public homepage view model', () => {
  it('prioritizes registration during REGISTRATION', () => {
    const entries = buildHomeEntries(ctx());
    expect(entries[0]).toMatchObject({ id: 'register', href: '/register', emphasis: 'primary' });
    expect(entries.map((e) => e.id)).toEqual([
      'register',
      'tournament',
      'leaderboard',
      'live',
      'login',
    ]);
  });

  it('prioritizes live draft during DRAFTING', () => {
    const entries = buildHomeEntries(ctx({ season: { name: '夏季赛', status: 'DRAFTING' } }));
    expect(entries[0]).toMatchObject({ id: 'live', href: '/live', emphasis: 'primary' });
    expect(entries.map((e) => e.id)).toEqual([
      'live',
      'tournament',
      'leaderboard',
      'register',
      'login',
    ]);
  });

  it('keeps login available when no active season exists', () => {
    const entries = buildHomeEntries({ season: null, tournament: null });
    expect(entries.map((e) => e.id)).toEqual(['login']);
    expect(entries[0].href).toBe('/login');
  });

  it('uses season status text without exposing private details', () => {
    expect(getSeasonStatusText(ctx()).headline).toBe('夏季赛报名开放中');
    expect(getSeasonStatusText({ season: null, tournament: null }).headline).toBe('暂无开放赛季');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/lib/home/public-home.test.ts --project unit
```

Expected: FAIL because `src/lib/home/public-home.ts` does not exist.

- [ ] **Step 3: Implement pure helper**

Create `src/lib/home/public-home.ts`:

```ts
export type HomeSeasonStatus =
  | 'SETUP'
  | 'REGISTRATION'
  | 'ROSTER_LOCKED'
  | 'DRAFTING'
  | 'COMPLETED'
  | 'ARCHIVED';

export type HomeTournamentStatus = 'SETUP' | 'GROUP_STAGE' | 'KNOCKOUT' | 'FINISHED';

export type PublicHomeContext = {
  season: { name: string; status: HomeSeasonStatus } | null;
  tournament: { status: HomeTournamentStatus } | null;
};

export type HomeEntry = {
  id: 'register' | 'tournament' | 'leaderboard' | 'live' | 'login';
  title: string;
  description: string;
  href: string;
  emphasis: 'primary' | 'normal' | 'muted';
};

const ENTRY: Record<HomeEntry['id'], Omit<HomeEntry, 'emphasis'>> = {
  register: {
    id: 'register',
    title: '赛事报名',
    description: '提交参赛信息，报名开放时优先从这里进入。',
    href: '/register',
  },
  tournament: {
    id: 'tournament',
    title: '赛事赛程',
    description: '查看赛程、积分、小组赛和淘汰赛对阵。',
    href: '/tournament',
  },
  leaderboard: {
    id: 'leaderboard',
    title: '选手数据榜',
    description: '进入赛事页的数据榜，查看 KDA、MVP 和场均数据。',
    href: '/tournament',
  },
  live: {
    id: 'live',
    title: '选秀直播',
    description: '观看选秀进程、队伍阵容和实时出手。',
    href: '/live',
  },
  login: {
    id: 'login',
    title: '登录后台',
    description: '管理员和队长从这里进入工作台。',
    href: '/login',
  },
};

function entry(id: HomeEntry['id'], emphasis: HomeEntry['emphasis'] = 'normal'): HomeEntry {
  return { ...ENTRY[id], emphasis };
}

export function buildHomeEntries(context: PublicHomeContext): HomeEntry[] {
  if (!context.season) return [entry('login', 'primary')];

  switch (context.season.status) {
    case 'REGISTRATION':
      return [
        entry('register', 'primary'),
        entry('tournament'),
        entry('leaderboard'),
        entry('live'),
        entry('login', 'muted'),
      ];
    case 'DRAFTING':
      return [
        entry('live', 'primary'),
        entry('tournament'),
        entry('leaderboard'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'COMPLETED':
    case 'ARCHIVED':
      return [
        entry('tournament', 'primary'),
        entry('leaderboard'),
        entry('live'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'ROSTER_LOCKED':
      return [
        entry('tournament', 'primary'),
        entry('live'),
        entry('leaderboard'),
        entry('register', 'muted'),
        entry('login', 'muted'),
      ];
    case 'SETUP':
    default:
      return [
        entry('tournament', 'primary'),
        entry('register'),
        entry('live'),
        entry('login', 'muted'),
      ];
  }
}

export function getSeasonStatusText(context: PublicHomeContext): {
  headline: string;
  description: string;
} {
  if (!context.season) {
    return {
      headline: '暂无开放赛季',
      description: '当前没有活跃赛季。管理员可以登录后台创建赛季。',
    };
  }

  const name = context.season.name;
  const tournament = context.tournament;
  const tournamentText = tournament ? `赛事状态：${tournament.status}` : '赛事暂未创建';

  switch (context.season.status) {
    case 'REGISTRATION':
      return { headline: `${name}报名开放中`, description: tournamentText };
    case 'ROSTER_LOCKED':
      return { headline: `${name}报名已截止`, description: tournamentText };
    case 'DRAFTING':
      return { headline: `${name}选秀进行中`, description: tournamentText };
    case 'COMPLETED':
      return { headline: `${name}已完成`, description: tournamentText };
    case 'ARCHIVED':
      return { headline: `${name}已归档`, description: tournamentText };
    case 'SETUP':
    default:
      return { headline: `${name}准备中`, description: tournamentText };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/lib/home/public-home.test.ts --project unit
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home/public-home.ts src/lib/home/public-home.test.ts
git commit -m "feat(home): add public homepage view model"
```

---

### Task 2: Public Home Component

**Files:**
- Create: `src/components/home/PublicHomePage.tsx`
- Create: `src/components/home/PublicHomePage.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/home/PublicHomePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicHomePage } from './PublicHomePage';
import type { PublicHomeContext } from '@/lib/home/public-home';

const registrationContext: PublicHomeContext = {
  season: { name: '夏季赛', status: 'REGISTRATION' },
  tournament: { status: 'SETUP' },
};

describe('PublicHomePage', () => {
  it('renders public entry links instead of a login-only page', () => {
    render(<PublicHomePage context={registrationContext} />);

    expect(screen.getByRole('link', { name: /赛事报名/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: /赛事赛程/ })).toHaveAttribute('href', '/tournament');
    expect(screen.getByRole('link', { name: /选秀直播/ })).toHaveAttribute('href', '/live');
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
  });

  it('shows the current season status', () => {
    render(<PublicHomePage context={registrationContext} />);
    expect(screen.getByRole('heading', { name: '夏季赛报名开放中' })).toBeInTheDocument();
  });

  it('keeps only login as the action when no active season exists', () => {
    render(<PublicHomePage context={{ season: null, tournament: null }} />);
    expect(screen.getByRole('heading', { name: '暂无开放赛季' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /赛事报名/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/components/home/PublicHomePage.test.tsx --project component
```

Expected: FAIL because `PublicHomePage` does not exist.

- [ ] **Step 3: Implement component**

Create `src/components/home/PublicHomePage.tsx`:

```tsx
import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildHomeEntries, getSeasonStatusText, type PublicHomeContext } from '@/lib/home/public-home';

type Props = {
  context: PublicHomeContext;
};

export function PublicHomePage({ context }: Props) {
  const entries = buildHomeEntries(context);
  const status = getSeasonStatusText(context);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">LoL 选人系统</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">
              {status.headline}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{status.description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              登录
            </Link>
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="公开入口">
          {entries.map((item) => {
            const isPrimary = item.emphasis === 'primary';
            return (
              <Link
                key={item.id}
                href={item.href}
                className={[
                  'group flex min-h-36 flex-col justify-between rounded-lg border p-4 transition-colors',
                  isPrimary
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-card hover:bg-muted/50',
                  item.emphasis === 'muted' ? 'opacity-80' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>
                  <span className="text-base font-semibold">{item.title}</span>
                  <span
                    className={[
                      'mt-2 block text-sm leading-6',
                      isPrimary ? 'text-primary-foreground/85' : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {item.description}
                  </span>
                </span>
                <span className="mt-4 inline-flex items-center text-sm font-medium">
                  进入
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/components/home/PublicHomePage.test.tsx --project component
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/PublicHomePage.tsx src/components/home/PublicHomePage.test.tsx
git commit -m "feat(home): render public homepage entries"
```

---

### Task 3: Wire Page and Middleware

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Replace root redirect with server page**

Modify `src/app/page.tsx` to:

```tsx
import { PublicHomePage } from '@/components/home/PublicHomePage';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const season = await getActiveSeason(prisma);
  const tournament = season
    ? await prisma.tournament.findUnique({
        where: { seasonId: season.id },
        select: { status: true },
      })
    : null;

  return (
    <PublicHomePage
      context={{
        season: season ? { name: season.name, status: season.status } : null,
        tournament: tournament ? { status: tournament.status } : null,
      }}
    />
  );
}
```

- [ ] **Step 2: Make `/` public in middleware**

Modify `src/middleware.ts`:

```ts
const PUBLIC_PREFIXES = ['/', '/login', '/access-denied', '/register', '/live', '/tournament'];
```

Then remove this root redirect block entirely:

```ts
  if (pathname === '/') {
    if (token.role === 'ADMIN') return NextResponse.redirect(new URL('/admin', req.url));
    if (token.role === 'CAPTAIN' && token.teamId) {
      return NextResponse.redirect(new URL('/captain', req.url));
    }
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }
```

The existing `isPublic()` function treats exact `/` correctly because `pathname === p` is true for `p === '/'`, and `pathname.startsWith('//')` is false for normal paths.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx vitest run src/lib/home/public-home.test.ts --project unit
npx vitest run src/components/home/PublicHomePage.test.tsx --project component
npm run typecheck
```

Expected: both focused test files pass and typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/middleware.ts
git commit -m "feat(home): make root path a public portal"
```

---

### Task 4: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Expected: all pass. Existing unrelated React Hook warnings during build do not block completion if the build exits 0.

- [ ] **Step 2: Manual route verification**

Start the app if no dev server is already running:

```bash
npm run dev
```

In another shell, verify root and protected behavior:

```bash
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:3000/login
curl -I http://127.0.0.1:3000/admin
```

Expected:
- `/` returns 200 and does not redirect to `/login`.
- `/login` returns 200.
- `/admin` returns a redirect to `/login` when unauthenticated.

- [ ] **Step 3: Final commit if verification artifacts changed**

No commit is needed if verification does not modify tracked files. Do not commit unrelated pre-existing draft drag-pick changes.
