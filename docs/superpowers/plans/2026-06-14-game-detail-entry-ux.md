# Game Detail Entry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce detailed game-entry friction by deriving PICK rows from player stats, adding a blue-side-aware ban template, and improving stat entry with KDA input, keyboard flow, and inline validation.

**Architecture:** Keep `saveGameDetail` and the database schema unchanged. Add a focused client-side utility module for payload construction and validation, extend only the admin match GET read model so editing existing games has complete detail, then wire the existing `GameDetailEditor` UI to the new utilities. Preserve legacy PICK rows when editing old games without complete player stats.

**Tech Stack:** Next.js 15 App Router, Prisma, React, TypeScript, shadcn/Radix UI primitives, Vitest unit and jsdom component projects.

---

## File Structure

- Create `src/components/admin/tournament/game-detail-entry-utils.ts`
  - Pure helpers for KDA parsing, stat completeness, standard ban template, PICK derivation, legacy PICK preservation, final BP payload construction, and duplicate detection.
- Create `src/components/admin/tournament/game-detail-entry-utils.test.tsx`
  - Unit tests for all pure helper branches before UI wiring.
- Modify `src/app/api/tournament/admin/matches/[id]/route.ts`
  - Extend admin GET only. Include full game detail fields needed by `GameDetailEditor` for editing existing games.
- Create `src/lib/tournament/match-detail-route.test.ts`
  - Route-level mocked test for the extended admin GET shape.
- Modify `src/components/admin/tournament/ScoreDialog.tsx`
  - Widen local `Game` type and pass full detail into `GameDetailEditor.initial`.
- Create `src/components/admin/tournament/ScoreDialog.test.tsx`
  - Component test proving existing game detail is forwarded to the editor.
- Modify `src/components/admin/tournament/GameDetailEditor.tsx`
  - Use utilities, show only BAN rows, retain legacy PICK rows, add standard ban template, add champion summary, replace K/D/A fields with KDA, add inline validation state and keyboard flow.
- Create `src/components/admin/tournament/GameDetailEditor.test.tsx`
  - Component tests for BP-only UI, derived PICK payload, legacy PICK preservation, incomplete stats blocking, template blue-side behavior, and KDA validation.

## Task 1: Pure Entry Utilities

**Files:**
- Create: `src/components/admin/tournament/game-detail-entry-utils.ts`
- Create: `src/components/admin/tournament/game-detail-entry-utils.test.tsx`

- [ ] **Step 1: Write failing tests for helper behavior**

Create `src/components/admin/tournament/game-detail-entry-utils.test.tsx`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildBansPayload,
  buildStandardBanRows,
  derivePicksFromStats,
  findChampionDuplicate,
  isStatsAllComplete,
  isStatsPristine,
  parseKda,
  type BanRowDraft,
  type StatRowDraft,
} from './game-detail-entry-utils';

const teamA = 'team-a';
const teamB = 'team-b';

function stat(registrationId: string, championId: string | null, patch: Partial<StatRowDraft> = {}): StatRowDraft {
  return {
    registrationId,
    nickname: registrationId,
    championId,
    kda: '1/2/3',
    cs: '100',
    damage: '10000',
    gold: '9000',
    ...patch,
  };
}

describe('game detail entry utils', () => {
  it('parseKda accepts slash, space, and dash separators', () => {
    expect(parseKda('12/3/7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12 3 7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12-3-7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12/3')).toBeNull();
    expect(parseKda('a/b/c')).toBeNull();
    expect(parseKda('')).toBeNull();
  });

  it('detects pristine, partial, and complete stats', () => {
    const empty = [stat('a1', null, { kda: '', cs: '', damage: '', gold: '' })];
    const partial = [stat('a1', 'Ahri', { kda: '', cs: '', damage: '', gold: '' })];
    const completeA = Array.from({ length: 5 }, (_, i) => stat(`a${i}`, `A${i}`));
    const completeB = Array.from({ length: 5 }, (_, i) => stat(`b${i}`, `B${i}`));

    expect(isStatsPristine(empty)).toBe(true);
    expect(isStatsPristine(partial)).toBe(false);
    expect(isStatsAllComplete(completeA, completeB)).toBe(true);
    expect(isStatsAllComplete(completeA, completeB.slice(0, 4))).toBe(false);
  });

  it('derives 10 PICK rows from complete stats with team ownership', () => {
    const statsA = Array.from({ length: 5 }, (_, i) => stat(`a${i}`, `A${i}`));
    const statsB = Array.from({ length: 5 }, (_, i) => stat(`b${i}`, `B${i}`));

    expect(derivePicksFromStats(statsA, statsB, teamA, teamB)).toEqual([
      { teamId: teamA, type: 'PICK', championId: 'A0' },
      { teamId: teamA, type: 'PICK', championId: 'A1' },
      { teamId: teamA, type: 'PICK', championId: 'A2' },
      { teamId: teamA, type: 'PICK', championId: 'A3' },
      { teamId: teamA, type: 'PICK', championId: 'A4' },
      { teamId: teamB, type: 'PICK', championId: 'B0' },
      { teamId: teamB, type: 'PICK', championId: 'B1' },
      { teamId: teamB, type: 'PICK', championId: 'B2' },
      { teamId: teamB, type: 'PICK', championId: 'B3' },
      { teamId: teamB, type: 'PICK', championId: 'B4' },
    ]);
  });

  it('builds final bans payload with derived picks when stats are complete', () => {
    const banRows: BanRowDraft[] = [
      { teamId: teamA, championId: 'BanA' },
      { teamId: teamB, championId: 'BanB' },
    ];
    const derivedPicks = [
      { teamId: teamA, type: 'PICK' as const, championId: 'Ahri' },
      { teamId: teamB, type: 'PICK' as const, championId: 'Garen' },
    ];
    const legacyPicks = [{ teamId: teamA, type: 'PICK' as const, championId: 'Legacy' }];

    expect(buildBansPayload({ banRows, derivedPicks, legacyPicks, useDerivedPicks: true })).toEqual([
      { teamId: teamA, type: 'BAN', championId: 'BanA', order: 1 },
      { teamId: teamB, type: 'BAN', championId: 'BanB', order: 2 },
      { teamId: teamA, type: 'PICK', championId: 'Ahri', order: 3 },
      { teamId: teamB, type: 'PICK', championId: 'Garen', order: 4 },
    ]);
  });

  it('preserves legacy picks when stats are not complete', () => {
    const banRows: BanRowDraft[] = [{ teamId: teamA, championId: 'BanA' }];
    const legacyPicks = [
      { teamId: teamB, type: 'PICK' as const, championId: 'Legacy1' },
      { teamId: teamA, type: 'PICK' as const, championId: 'Legacy2' },
    ];

    expect(buildBansPayload({ banRows, derivedPicks: [], legacyPicks, useDerivedPicks: false })).toEqual([
      { teamId: teamA, type: 'BAN', championId: 'BanA', order: 1 },
      { teamId: teamB, type: 'PICK', championId: 'Legacy1', order: 2 },
      { teamId: teamA, type: 'PICK', championId: 'Legacy2', order: 3 },
    ]);
  });

  it('detects duplicate champions across ban and pick segments', () => {
    expect(findChampionDuplicate([
      { source: 'ban', label: 'BAN 1', championId: 'Ahri' },
      { source: 'pick', label: 'PICK 1', championId: 'Ahri' },
    ])).toEqual({ championId: 'Ahri', firstLabel: 'BAN 1', secondLabel: 'PICK 1' });
  });

  it('builds a blue-red alternating standard ban template', () => {
    expect(buildStandardBanRows('blue', 'red')).toEqual([
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
    ]);
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
npx vitest run src/components/admin/tournament/game-detail-entry-utils.test.tsx --project component
```

Expected: FAIL with an import error for `./game-detail-entry-utils`.

- [ ] **Step 3: Implement pure helpers**

Create `src/components/admin/tournament/game-detail-entry-utils.ts`:

```ts
export type BanRowDraft = {
  teamId: string;
  championId: string | null;
};

export type PickDraft = {
  teamId: string;
  type: 'PICK';
  championId: string;
};

export type BanPickPayload = {
  teamId: string;
  type: 'BAN' | 'PICK';
  championId: string;
  order: number;
};

export type StatRowDraft = {
  registrationId: string;
  nickname: string;
  championId: string | null;
  kda: string;
  cs: string;
  damage: string;
  gold: string;
};

export type ParsedKda = { kills: number; deaths: number; assists: number };

export type ChampionDuplicateInput = {
  source: 'ban' | 'pick' | 'stat';
  label: string;
  championId: string | null;
};

export function parseKda(input: string): ParsedKda | null {
  const parts = input.trim().split(/[\s/-]+/);
  if (parts.length !== 3) return null;
  const nums = parts.map((part) => Number(part));
  if (!nums.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return { kills: nums[0], deaths: nums[1], assists: nums[2] };
}

export function parseNonNegativeInteger(input: string): number | null {
  if (input.trim() === '') return null;
  const value = Number(input);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function isStatRowPristine(row: StatRowDraft): boolean {
  return !row.championId && row.kda === '' && row.cs === '' && row.damage === '' && row.gold === '';
}

export function isStatsPristine(rows: StatRowDraft[]): boolean {
  return rows.every(isStatRowPristine);
}

export function isStatRowComplete(row: StatRowDraft): boolean {
  return (
    !!row.championId &&
    parseKda(row.kda) !== null &&
    parseNonNegativeInteger(row.cs) !== null &&
    parseNonNegativeInteger(row.damage) !== null &&
    parseNonNegativeInteger(row.gold) !== null
  );
}

export function isStatsAllComplete(rowsA: StatRowDraft[], rowsB: StatRowDraft[]): boolean {
  return rowsA.length === 5 && rowsB.length === 5 && rowsA.every(isStatRowComplete) && rowsB.every(isStatRowComplete);
}

export function derivePicksFromStats(rowsA: StatRowDraft[], rowsB: StatRowDraft[], teamAId: string, teamBId: string): PickDraft[] {
  return [
    ...rowsA.map((row) => ({ teamId: teamAId, type: 'PICK' as const, championId: row.championId! })),
    ...rowsB.map((row) => ({ teamId: teamBId, type: 'PICK' as const, championId: row.championId! })),
  ];
}

export function buildBansPayload(input: {
  banRows: BanRowDraft[];
  derivedPicks: PickDraft[];
  legacyPicks: PickDraft[];
  useDerivedPicks: boolean;
}): BanPickPayload[] {
  const picks = input.useDerivedPicks ? input.derivedPicks : input.legacyPicks;
  return [
    ...input.banRows.map((row) => ({
      teamId: row.teamId,
      type: 'BAN' as const,
      championId: row.championId!,
    })),
    ...picks,
  ].map((row, index) => ({ ...row, order: index + 1 }));
}

export function findChampionDuplicate(items: ChampionDuplicateInput[]): { championId: string; firstLabel: string; secondLabel: string } | null {
  const seen = new Map<string, string>();
  for (const item of items) {
    if (!item.championId) continue;
    const firstLabel = seen.get(item.championId);
    if (firstLabel) return { championId: item.championId, firstLabel, secondLabel: item.label };
    seen.set(item.championId, item.label);
  }
  return null;
}

export function buildStandardBanRows(blueTeamId: string, redTeamId: string): BanRowDraft[] {
  return Array.from({ length: 10 }, (_, index) => ({
    teamId: index % 2 === 0 ? blueTeamId : redTeamId,
    championId: null,
  }));
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
npx vitest run src/components/admin/tournament/game-detail-entry-utils.test.tsx --project component
```

Expected: PASS.

- [ ] **Step 5: Commit helpers**

```bash
git add src/components/admin/tournament/game-detail-entry-utils.ts src/components/admin/tournament/game-detail-entry-utils.test.tsx
git commit -m "feat(tournament): add game detail entry helpers"
```

## Task 2: Admin Match GET Full Game Detail

**Files:**
- Modify: `src/app/api/tournament/admin/matches/[id]/route.ts`
- Create: `src/lib/tournament/match-detail-route.test.ts`

- [ ] **Step 1: Write failing route test for full admin game detail**

Create `src/lib/tournament/match-detail-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAdminMock, findUniqueMock, findManyMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    match: { findUnique: findUniqueMock },
    tournamentTeam: { findMany: findManyMock },
  },
}));

describe('admin match detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminMock.mockReset();
    findUniqueMock.mockReset();
    findManyMock.mockReset();
  });

  it('returns complete game detail fields for editing existing games', async () => {
    requireAdminMock.mockResolvedValueOnce({ session: { user: { id: 'admin', role: 'ADMIN' } } });
    findUniqueMock.mockResolvedValueOnce({
      id: 'match-1',
      version: 7,
      bestOf: 3,
      status: 'SCHEDULED',
      tournamentId: 'tour-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerTeamId: null,
      games: [
        {
          id: 'game-1',
          index: 1,
          isDraft: false,
          winnerTeamId: 'team-a',
          blueTeamId: 'team-b',
          durationSeconds: 1815,
          mvpRegistrationId: 'reg-a',
          bans: [
            { teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 },
            { teamId: 'team-a', type: 'PICK', championId: 'Garen', order: 2 },
          ],
          playerStats: [
            {
              teamId: 'team-a',
              registrationId: 'reg-a',
              championId: 'Garen',
              kills: 10,
              deaths: 1,
              assists: 8,
              cs: 220,
              damage: 30000,
              gold: 14000,
            },
          ],
          _count: { bans: 2, playerStats: 1 },
        },
      ],
    });
    findManyMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/tournament/admin/matches/[id]/route');
    const res = await GET(new Request('http://localhost/api'), { params: Promise.resolve({ id: 'match-1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match.games[0]).toEqual({
      id: 'game-1',
      index: 1,
      isDraft: false,
      winnerTeamId: 'team-a',
      hasBans: true,
      hasStats: false,
      blueTeamId: 'team-b',
      durationSeconds: 1815,
      mvpRegistrationId: 'reg-a',
      bans: [
        { teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 },
        { teamId: 'team-a', type: 'PICK', championId: 'Garen', order: 2 },
      ],
      playerStats: [
        {
          teamId: 'team-a',
          registrationId: 'reg-a',
          championId: 'Garen',
          kills: 10,
          deaths: 1,
          assists: 8,
          cs: 220,
          damage: 30000,
          gold: 14000,
        },
      ],
    });
  });

  it('returns empty arrays and null scalars for games without detail', async () => {
    requireAdminMock.mockResolvedValueOnce({ session: { user: { id: 'admin', role: 'ADMIN' } } });
    findUniqueMock.mockResolvedValueOnce({
      id: 'match-1',
      version: 1,
      bestOf: 1,
      status: 'SCHEDULED',
      tournamentId: 'tour-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerTeamId: null,
      games: [
        {
          id: 'game-empty',
          index: 1,
          isDraft: true,
          winnerTeamId: null,
          blueTeamId: null,
          durationSeconds: null,
          mvpRegistrationId: null,
          bans: [],
          playerStats: [],
          _count: { bans: 0, playerStats: 0 },
        },
      ],
    });
    findManyMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/tournament/admin/matches/[id]/route');
    const res = await GET(new Request('http://localhost/api'), { params: Promise.resolve({ id: 'match-1' }) });

    expect(res.status).toBe(200);
    const game = (await res.json()).match.games[0];
    expect(game.blueTeamId).toBeNull();
    expect(game.durationSeconds).toBeNull();
    expect(game.mvpRegistrationId).toBeNull();
    expect(game.bans).toEqual([]);
    expect(game.playerStats).toEqual([]);
  });
});
```

- [ ] **Step 2: Run route test and verify it fails**

Run:

```bash
npx vitest run src/lib/tournament/match-detail-route.test.ts --project unit
```

Expected: FAIL because `blueTeamId`, `durationSeconds`, `mvpRegistrationId`, `bans`, and `playerStats` are not returned.

- [ ] **Step 3: Extend admin GET query and response shape**

In `src/app/api/tournament/admin/matches/[id]/route.ts`, change the `games` include from count-only to full detail:

```ts
games: {
  orderBy: { index: 'asc' },
  include: {
    bans: { orderBy: { order: 'asc' } },
    playerStats: { orderBy: [{ teamId: 'asc' }, { registrationId: 'asc' }] },
    _count: { select: { bans: true, playerStats: true } },
  },
},
```

Then change the `games` projection:

```ts
games: match.games.map((g) => ({
  id: g.id,
  index: g.index,
  isDraft: g.isDraft,
  winnerTeamId: g.winnerTeamId,
  hasBans: g._count.bans > 0,
  hasStats: g._count.playerStats === 10,
  blueTeamId: g.blueTeamId,
  durationSeconds: g.durationSeconds,
  mvpRegistrationId: g.mvpRegistrationId,
  bans: g.bans.map((b) => ({
    teamId: b.teamId,
    type: b.type,
    championId: b.championId,
    order: b.order,
  })),
  playerStats: g.playerStats.map((s) => ({
    teamId: s.teamId,
    registrationId: s.registrationId,
    championId: s.championId,
    kills: s.kills,
    deaths: s.deaths,
    assists: s.assists,
    cs: s.cs,
    damage: s.damage,
    gold: s.gold,
  })),
})),
```

- [ ] **Step 4: Run route test and verify it passes**

Run:

```bash
npx vitest run src/lib/tournament/match-detail-route.test.ts --project unit
```

Expected: PASS.

- [ ] **Step 5: Run affected route regression tests**

Run:

```bash
npx vitest run src/lib/tournament/match-detail-route.test.ts src/lib/tournament/game-detail-service.test.ts --project unit
```

Expected: PASS. This confirms the read model changed but the write service still behaves.

- [ ] **Step 6: Commit admin read detail extension**

```bash
git add 'src/app/api/tournament/admin/matches/[id]/route.ts' src/lib/tournament/match-detail-route.test.ts
git commit -m "feat(tournament): return admin game detail for editing"
```

## Task 3: ScoreDialog Detail Forwarding

**Files:**
- Modify: `src/components/admin/tournament/ScoreDialog.tsx`
- Create: `src/components/admin/tournament/ScoreDialog.test.tsx`

- [ ] **Step 1: Write failing component test for forwarding existing detail**

Create `src/components/admin/tournament/ScoreDialog.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { GameDetailInitial } from './GameDetailEditor';
import { ScoreDialog } from './ScoreDialog';

const editorSpy = vi.hoisted(() => vi.fn());

vi.mock('./GameDetailEditor', () => ({
  GameDetailEditor: (props: { open: boolean; initial: GameDetailInitial | null }) => {
    if (props.open) editorSpy(props.initial);
    return props.open ? <div data-testid="game-detail-editor" /> : null;
  },
}));

describe('ScoreDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    editorSpy.mockReset();
  });

  it('passes full existing game detail to GameDetailEditor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        match: {
          games: [
            {
              id: 'game-1',
              index: 1,
              isDraft: false,
              winnerTeamId: 'team-a',
              hasBans: true,
              hasStats: true,
              blueTeamId: 'team-b',
              durationSeconds: 1815,
              mvpRegistrationId: 'reg-a',
              bans: [{ teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 }],
              playerStats: [{
                teamId: 'team-a',
                registrationId: 'reg-a',
                championId: 'Garen',
                kills: 1,
                deaths: 2,
                assists: 3,
                cs: 100,
                damage: 1000,
                gold: 900,
              }],
            },
          ],
          rosters: [],
        },
      }),
    }));

    render(
      <ScoreDialog
        open
        onClose={vi.fn()}
        refetch={vi.fn()}
        match={{
          id: 'match-1',
          status: 'SCHEDULED',
          version: 4,
          bestOf: 3,
          winnerTeamId: null,
          teamA: { id: 'team-a', name: 'A 队' },
          teamB: { id: 'team-b', name: 'B 队' },
        }}
      />,
    );

    await screen.findByText('第 1 局');
    fireEvent.click(screen.getByRole('button', { name: '详细' }));

    await waitFor(() => expect(editorSpy).toHaveBeenCalled());
    expect(editorSpy.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      id: 'game-1',
      blueTeamId: 'team-b',
      durationSeconds: 1815,
      mvpRegistrationId: 'reg-a',
      bans: [{ teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 }],
      playerStats: [expect.objectContaining({ registrationId: 'reg-a', championId: 'Garen' })],
    }));
  });
});
```

- [ ] **Step 2: Run ScoreDialog test and verify it fails if detail is not forwarded**

Run:

```bash
npx vitest run src/components/admin/tournament/ScoreDialog.test.tsx --project component
```

Expected: FAIL if `openDetailForGame` drops full detail fields.

- [ ] **Step 3: Widen ScoreDialog game type and simplify forwarding**

In `src/components/admin/tournament/ScoreDialog.tsx`, replace the local `Game` type with a type that includes full detail fields:

```ts
type Game = GameDetailInitial;
```

Then replace `openDetailForGame` with:

```ts
function openDetailForGame(game: Game) {
  setDetailGameId(game.id);
  setDetailInitial(game);
  setDetailOpen(true);
}
```

Keep `openDetailForNew` unchanged.

- [ ] **Step 4: Run ScoreDialog test and verify it passes**

Run:

```bash
npx vitest run src/components/admin/tournament/ScoreDialog.test.tsx --project component
```

Expected: PASS.

- [ ] **Step 5: Commit ScoreDialog forwarding**

```bash
git add src/components/admin/tournament/ScoreDialog.tsx src/components/admin/tournament/ScoreDialog.test.tsx
git commit -m "feat(tournament): forward game detail into editor"
```

## Task 4: BP Payload, Legacy PICK, and Standard Ban Template UI

**Files:**
- Modify: `src/components/admin/tournament/GameDetailEditor.tsx`
- Modify: `src/components/admin/tournament/GameDetailEditor.test.tsx`

- [ ] **Step 1: Write component tests for BP-only UI and derived PICK payload**

Create `src/components/admin/tournament/GameDetailEditor.test.tsx` if it does not exist, with these shared helpers:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameDetailEditor, type Props } from './GameDetailEditor';

vi.mock('./ChampionSelect', () => ({
  ChampionSelect: ({ value, onChange }: { value: string | null; onChange: (v: string) => void }) => (
    <select
      aria-label="英雄"
      data-testid="champion-select"
      role="combobox"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">选择英雄</option>
      {Array.from({ length: 40 }, (_, i) => (
        <option key={i} value={`Champion${i}`}>Champion{i}</option>
      ))}
      <option value="Ahri">Ahri</option>
      <option value="Garen">Garen</option>
      <option value="Lux">Lux</option>
    </select>
  ),
}));

function players(prefix: string) {
  return Array.from({ length: 5 }, (_, i) => ({
    registrationId: `${prefix}-${i}`,
    nickname: `${prefix}选手${i}`,
  }));
}

function props(overrides: Partial<Props> = {}): Props {
  return {
    open: true,
    onClose: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
    match: {
      id: 'match-1',
      version: 3,
      bestOf: 3,
      teamA: { id: 'team-a', name: 'A 队' },
      teamB: { id: 'team-b', name: 'B 队' },
    },
    rosters: [
      { teamId: 'team-a', players: players('A') },
      { teamId: 'team-b', players: players('B') },
    ],
    ...overrides,
  };
}

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, gameId: 'game-1' }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function chooseStatChampions() {
  const heroSelects = screen.getAllByTestId('champion-select');
  const statHeroSelects = heroSelects.slice(-10);
  statHeroSelects.forEach((select, i) => {
    fireEvent.change(select, { target: { value: `Champion${i}` } });
  });
}
```

Add tests:

```tsx
describe('GameDetailEditor BP payload', () => {
  it('shows only BAN rows and no manual PICK selector', () => {
    render(<GameDetailEditor {...props()} initial={{
      id: 'game-1',
      index: 1,
      isDraft: false,
      winnerTeamId: 'team-a',
      hasBans: true,
      hasStats: false,
      bans: [
        { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
        { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 2 },
      ],
    }} />);

    const selectedChampions = screen
      .getAllByTestId('champion-select')
      .map((select) => (select as HTMLSelectElement).value);
    expect(selectedChampions).toContain('Ahri');
    expect(selectedChampions).not.toContain('Garen');
    expect(screen.queryByRole('option', { name: 'PICK' })).not.toBeInTheDocument();
  });

  it('sends BAN rows plus 10 derived PICK rows when stats are complete', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /添加 BAN/ }));
    fireEvent.change(screen.getAllByTestId('champion-select')[0], { target: { value: 'Champion10' } });
    chooseStatChampions();

    for (const input of screen.getAllByLabelText('KDA')) fireEvent.change(input, { target: { value: '1/2/3' } });
    for (const input of screen.getAllByLabelText('CS')) fireEvent.change(input, { target: { value: '100' } });
    for (const input of screen.getAllByLabelText('伤害')) fireEvent.change(input, { target: { value: '10000' } });
    for (const input of screen.getAllByLabelText('金币')) fireEvent.change(input, { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toHaveLength(11);
    expect(body.detail.bans[0]).toEqual({ teamId: 'team-a', type: 'BAN', championId: 'Champion10', order: 1 });
    expect(body.detail.bans.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PICK', order: 2 }),
      expect.objectContaining({ type: 'PICK', order: 11 }),
    ]));
  });

  it('preserves legacy PICK rows when editing BAN without complete stats', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: false,
        bans: [
          { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
          { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 2 },
        ],
      },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /添加 BAN/ }));
    fireEvent.change(screen.getAllByTestId('champion-select')[1], { target: { value: 'Lux' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toEqual([
      { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
      { teamId: 'team-a', type: 'BAN', championId: 'Lux', order: 2 },
      { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 3 },
    ]);
  });

  it('clears legacy PICK only when BP is explicitly cleared', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: false,
        bans: [{ teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 1 }],
      },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: '整段清空 BP' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toBeNull();
  });
});
```

- [ ] **Step 2: Run BP tests and verify they fail**

Run:

```bash
npx vitest run src/components/admin/tournament/GameDetailEditor.test.tsx --project component
```

Expected: FAIL because the current editor still supports manual PICK rows, lacks legacy PICK preservation, and does not derive PICK from stats.

- [ ] **Step 3: Update local BP state and initial split**

In `GameDetailEditor.tsx`, change `BanRow` and add legacy PICK state:

```ts
type BanRow = { teamId: string; championId: string | null };
type LegacyPickRow = { teamId: string; type: 'PICK'; championId: string };

const [bans, setBans] = useState<BanRow[]>([]);
const [legacyPicks, setLegacyPicks] = useState<LegacyPickRow[]>([]);
```

In `resetForm`, split initial bans:

```ts
const initBans = initial?.bans ?? [];
setBans(
  initBans
    .filter((b) => b.type === 'BAN')
    .map((b) => ({ teamId: b.teamId, championId: b.championId })),
);
setLegacyPicks(
  initBans
    .filter((b): b is { teamId: string; type: 'PICK'; championId: string; order: number } => b.type === 'PICK')
    .map((b) => ({ teamId: b.teamId, type: 'PICK', championId: b.championId })),
);
```

In `clearBans`, also clear legacy picks:

```ts
function clearBans() {
  setBans([]);
  setLegacyPicks([]);
  setBansTouched(true);
  setBansCleared(true);
}
```

- [ ] **Step 4: Remove manual PICK UI**

In the BP editor section, remove the type `<Select>` entirely and change labels:

```tsx
<Section
  title="BP（禁用英雄）"
  action={
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={clearBans}
    >
      整段清空 BP
    </Button>
  }
>
```

Change the add button:

```tsx
<Button variant="outline" size="sm" onClick={addBanRow} className="mt-1">
  <Plus className="h-4 w-4" />
  添加 BAN
</Button>
```

Change `addBanRow` and `updateBanRow` to no longer write `type`:

```ts
function addBanRow() {
  setBans((prev) => [...prev, { teamId: match.teamA.id, championId: null }]);
  setBansTouched(true);
  setBansCleared(false);
}
```

- [ ] **Step 5: Convert stat rows to KDA before deriving PICK**

Task 4 must be independently green. Move the minimal KDA shape into this task before using `isStatsAllComplete(statsA, statsB)`, because the helper reads `row.kda`.

In `GameDetailEditor.tsx`, change `StatRow`:

```ts
type StatRow = {
  registrationId: string;
  nickname: string;
  championId: string | null;
  kda: string;
  cs: string;
  damage: string;
  gold: string;
};
```

Update `blankStatRow`:

```ts
function blankStatRow(p: RosterPlayer): StatRow {
  return {
    registrationId: p.registrationId,
    nickname: p.nickname,
    championId: null,
    kda: '',
    cs: '',
    damage: '',
    gold: '',
  };
}
```

Update `populateStatRow`:

```ts
function populateStatRow(p: RosterPlayer, existing: RawStat | undefined): StatRow {
  if (!existing) return blankStatRow(p);
  return {
    registrationId: p.registrationId,
    nickname: p.nickname,
    championId: existing.championId,
    kda: `${existing.kills}/${existing.deaths}/${existing.assists}`,
    cs: String(existing.cs),
    damage: String(existing.damage),
    gold: String(existing.gold),
  };
}
```

Replace `STAT_COLS` so the table exposes `KDA` in Task 4, before BP payload tests try to fill complete stats:

```ts
const STAT_COLS: Array<{ key: 'kda' | 'cs' | 'damage' | 'gold'; label: string }> = [
  { key: 'kda', label: 'KDA' },
  { key: 'cs', label: 'CS' },
  { key: 'damage', label: '伤害' },
  { key: 'gold', label: '金币' },
];
```

In the stat table header, use the five data columns:

```tsx
<div className="grid min-w-[640px] grid-cols-[110px_180px_88px_72px_88px_88px] gap-1 text-xs text-muted-foreground">
  <span>选手</span>
  <span>英雄</span>
  <span>KDA</span>
  <span>CS</span>
  <span>伤害</span>
  <span>金币</span>
</div>
```

- [ ] **Step 6: Build payload with derived or legacy PICK**

Import helpers:

```ts
import {
  buildBansPayload,
  buildStandardBanRows,
  derivePicksFromStats,
  findChampionDuplicate,
  isStatsAllComplete,
  isStatsPristine,
  parseKda,
  parseNonNegativeInteger,
} from './game-detail-entry-utils';
```

In `buildPayload`, compute stats state once:

```ts
const statsComplete = isStatsAllComplete(statsA, statsB);
const derivedPicks = statsComplete
  ? derivePicksFromStats(statsA, statsB, match.teamA.id, match.teamB.id)
  : [];
```

Still in `buildPayload`, update `playerStats` construction to parse KDA. Build these arrays only inside the `statsComplete` branch so empty or partial stats do not parse `null` KDA values:

```ts
if (statsTouched) {
  if (statsCleared) {
    detail.playerStats = null;
  } else if (statsComplete) {
    const rowsA = statsA.map((r) => {
      const kda = parseKda(r.kda)!;
      return {
        teamId: match.teamA.id,
        registrationId: r.registrationId,
        championId: r.championId!,
        kills: kda.kills,
        deaths: kda.deaths,
        assists: kda.assists,
        cs: parseNonNegativeInteger(r.cs)!,
        damage: parseNonNegativeInteger(r.damage)!,
        gold: parseNonNegativeInteger(r.gold)!,
      };
    });
    const rowsB = statsB.map((r) => {
      const kda = parseKda(r.kda)!;
      return {
        teamId: match.teamB.id,
        registrationId: r.registrationId,
        championId: r.championId!,
        kills: kda.kills,
        deaths: kda.deaths,
        assists: kda.assists,
        cs: parseNonNegativeInteger(r.cs)!,
        damage: parseNonNegativeInteger(r.damage)!,
        gold: parseNonNegativeInteger(r.gold)!,
      };
    });
    detail.playerStats = [...rowsA, ...rowsB];
  }
}
```

When writing `detail.bans`, replace the current `bans.map` with:

```ts
detail.bans = buildBansPayload({
  banRows: bans,
  derivedPicks,
  legacyPicks,
  useDerivedPicks: statsComplete,
});
```

If `bansCleared` remains true, keep `detail.bans = null`.

- [ ] **Step 7: Add duplicate validation across BAN and final PICK segment**

In `validate`, after checking missing BAN champions:

```ts
const statsComplete = isStatsAllComplete(statsA, statsB);
const pickItems = statsComplete
  ? derivePicksFromStats(statsA, statsB, match.teamA.id, match.teamB.id).map((pick, index) => ({
      source: 'stat' as const,
      label: `选手英雄 ${index + 1}`,
      championId: pick.championId,
    }))
  : legacyPicks.map((pick, index) => ({
      source: 'pick' as const,
      label: `既有 PICK ${index + 1}`,
      championId: pick.championId,
    }));

const duplicate = findChampionDuplicate([
  ...bans.map((ban, index) => ({ source: 'ban' as const, label: `BAN ${index + 1}`, championId: ban.championId })),
  ...pickItems,
]);
if (duplicate) return `同局英雄不可重复：${duplicate.championId}`;
```

- [ ] **Step 8: Add standard BAN template button with blue-side resolution**

Add helper in `GameDetailEditor.tsx`:

```ts
function applyStandardBanTemplate() {
  if (bans.length > 0 && !window.confirm('套用标准模板会覆盖当前 BAN 行，是否继续？')) return;
  const blue = blueTeamId ?? match.teamA.id;
  const red = blue === match.teamA.id ? match.teamB.id : match.teamA.id;
  if (!blueTeamId) {
    setBlueTeamId(match.teamA.id);
    setBlueTouched(true);
  }
  setBans(buildStandardBanRows(blue, red));
  setBansTouched(true);
  setBansCleared(false);
}
```

In the BP section action area, add a template button near the clear button:

```tsx
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground">
    {blueTeamId
      ? `以 ${(blueTeamId === match.teamA.id ? match.teamA.name : match.teamB.name)} 为蓝方`
      : `将以 ${match.teamA.name} 为蓝方`}
  </span>
  <Button variant="outline" size="sm" onClick={applyStandardBanTemplate}>
    套用标准模板
  </Button>
  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={clearBans}>
    整段清空 BP
  </Button>
</div>
```

- [ ] **Step 9: Add champion summary below BP**

Add derived list:

```ts
const statsChampionSummary = [
  { teamName: match.teamA.name, rows: statsA },
  { teamName: match.teamB.name, rows: statsB },
];
```

Render after BAN rows:

```tsx
<div className="rounded-md border bg-muted/30 p-2 text-xs">
  <p className="mb-1 font-medium text-muted-foreground">本局英雄</p>
  {statsAllComplete ? (
    <div className="space-y-1">
      {statsChampionSummary.map((group) => (
        <div key={group.teamName} className="flex flex-wrap gap-1">
          <span className="mr-1 text-muted-foreground">{group.teamName}</span>
          {group.rows.map((row) => (
            <span key={row.registrationId} className="rounded border px-1">
              {row.championId}
            </span>
          ))}
        </div>
      ))}
    </div>
  ) : (
    <p className="text-muted-foreground">填齐双方数据后自动生成 PICK</p>
  )}
</div>
```

- [ ] **Step 10: Run BP component tests and verify they pass**

Run:

```bash
npx vitest run src/components/admin/tournament/GameDetailEditor.test.tsx --project component
```

Expected: PASS for BP-related tests.

- [ ] **Step 11: Commit BP behavior**

```bash
git add src/components/admin/tournament/GameDetailEditor.tsx src/components/admin/tournament/GameDetailEditor.test.tsx
git commit -m "feat(tournament): derive picks from game stats"
```

## Task 5: KDA Input, Stats Three-State Validation, Inline Errors, and Keyboard Flow

**Files:**
- Modify: `src/components/admin/tournament/GameDetailEditor.tsx`
- Modify: `src/components/admin/tournament/GameDetailEditor.test.tsx`

- [ ] **Step 1: Add failing tests for KDA and stats three-state behavior**

Append to `GameDetailEditor.test.tsx`:

```tsx
describe('GameDetailEditor stat entry', () => {
  it('does not send playerStats when stats are completely empty', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.playerStats).toBeUndefined();
  });

  it('blocks save and marks cells when stats are partially filled', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props()} />);

    fireEvent.change(screen.getAllByLabelText('KDA')[0], { target: { value: '1/2/3' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(screen.getByText(/选手数据需双方各 5 人填齐/)).toBeInTheDocument();
    expect(screen.getByTestId('stat-champion-cell-A-0')).toHaveAttribute('data-invalid', 'true');
  });

  it('parses KDA input into kills deaths and assists payload fields', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props()} />);

    chooseStatChampions();
    for (const input of screen.getAllByLabelText('KDA')) fireEvent.change(input, { target: { value: '12/3/7' } });
    for (const input of screen.getAllByLabelText('CS')) fireEvent.change(input, { target: { value: '100' } });
    for (const input of screen.getAllByLabelText('伤害')) fireEvent.change(input, { target: { value: '10000' } });
    for (const input of screen.getAllByLabelText('金币')) fireEvent.change(input, { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.playerStats[0]).toEqual(expect.objectContaining({
      kills: 12,
      deaths: 3,
      assists: 7,
      cs: 100,
      damage: 10000,
      gold: 9000,
    }));
  });

  it('moves Enter from a stat cell to the next row in the same team table', () => {
    render(<GameDetailEditor {...props()} />);

    const kdaInputs = screen.getAllByLabelText('KDA');
    kdaInputs[0].focus();
    fireEvent.keyDown(kdaInputs[0], { key: 'Enter' });
    expect(kdaInputs[1]).toHaveFocus();

    const teamBFirst = kdaInputs[5];
    teamBFirst.focus();
    fireEvent.keyDown(teamBFirst, { key: 'Enter' });
    expect(kdaInputs[6]).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run stat-entry tests and verify they fail**

Run:

```bash
npx vitest run src/components/admin/tournament/GameDetailEditor.test.tsx --project component
```

Expected: FAIL because KDA exists from Task 4, but inline stat error state and Enter-to-next-row behavior are not implemented yet.

- [ ] **Step 3: Implement stat validation states**

Add error state:

```ts
type FieldKey = 'championId' | 'kda' | 'cs' | 'damage' | 'gold';
type StatErrorMap = Record<string, Partial<Record<FieldKey, string>>>;

const [statErrors, setStatErrors] = useState<StatErrorMap>({});
```

Add a helper:

```ts
function buildStatErrors(rows: StatRow[]): StatErrorMap {
  const errors: StatErrorMap = {};
  for (const row of rows) {
    const rowErrors: Partial<Record<FieldKey, string>> = {};
    if (!row.championId) rowErrors.championId = '请选择英雄';
    if (parseKda(row.kda) === null) rowErrors.kda = 'KDA 格式错误';
    if (parseNonNegativeInteger(row.cs) === null) rowErrors.cs = '请输入非负整数';
    if (parseNonNegativeInteger(row.damage) === null) rowErrors.damage = '请输入非负整数';
    if (parseNonNegativeInteger(row.gold) === null) rowErrors.gold = '请输入非负整数';
    if (Object.keys(rowErrors).length > 0) errors[row.registrationId] = rowErrors;
  }
  return errors;
}
```

In `validate`, replace the current `statsTouched && !statsCleared && !statsAllComplete` branch:

```ts
const statsPristine = isStatsPristine(statsA) && isStatsPristine(statsB);
const statsComplete = isStatsAllComplete(statsA, statsB);
if (statsTouched && !statsCleared && !statsPristine && !statsComplete) {
  const errors = { ...buildStatErrors(statsA), ...buildStatErrors(statsB) };
  setStatErrors(errors);
  queueMicrotask(() => {
    const first = document.querySelector('[data-invalid="true"], [aria-invalid="true"]') as HTMLElement | null;
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first?.focus();
  });
  return '选手数据需双方各 5 人填齐才会保存；如只想存其他字段，请整段清空选手数据';
}
setStatErrors({});
```

- [ ] **Step 4: Render inline errors and Enter keyboard flow**

Change `StatsTable` props:

```ts
function StatsTable({
  tableKey,
  teamName,
  rows,
  errors,
  onUpdate,
}: {
  tableKey: 'A' | 'B';
  teamName: string;
  rows: StatRow[];
  errors: StatErrorMap;
  onUpdate: (idx: number, patch: Partial<StatRow>) => void;
}) {
```

Pass `tableKey="A" errors={statErrors}` and `tableKey="B" errors={statErrors}` from the two `StatsTable` calls.

For each input, add `aria-label`, `aria-invalid`, and a red border class when invalid:

```tsx
<Input
  aria-label={col.label}
  aria-invalid={errors[row.registrationId]?.[col.key] ? 'true' : 'false'}
  inputMode="numeric"
  value={row[col.key]}
  onChange={(e) => onUpdate(idx, { [col.key]: e.target.value })}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = document.querySelector<HTMLInputElement>(`[data-stat-input="${tableKey}-${col.key}-${idx + 1}"]`);
      next?.focus();
    }
  }}
  data-stat-input={`${tableKey}-${col.key}-${idx}`}
  className={errors[row.registrationId]?.[col.key] ? 'h-10 border-destructive' : 'h-10'}
/>
```

For the champion select wrapper, expose invalid state without reusing `aria-label="英雄"` on the wrapper. The inner `ChampionSelect` keeps the accessible label; the wrapper only provides a deterministic test and styling hook:

```tsx
<div
  data-testid={`stat-champion-cell-${tableKey}-${idx}`}
  data-invalid={errors[row.registrationId]?.championId ? 'true' : 'false'}
  tabIndex={-1}
  className={errors[row.registrationId]?.championId ? 'rounded-md border border-destructive' : undefined}
>
  <ChampionSelect value={row.championId} onChange={(k) => onUpdate(idx, { championId: k })} />
</div>
```

- [ ] **Step 5: Run stat-entry tests and verify they pass**

Run:

```bash
npx vitest run src/components/admin/tournament/GameDetailEditor.test.tsx --project component
```

Expected: PASS.

- [ ] **Step 6: Run all affected component tests**

Run:

```bash
npx vitest run src/components/admin/tournament/GameDetailEditor.test.tsx src/components/admin/tournament/ScoreDialog.test.tsx src/components/admin/tournament/ScheduleTab.test.tsx --project component
```

Expected: PASS.

- [ ] **Step 7: Commit stat entry UX**

```bash
git add src/components/admin/tournament/GameDetailEditor.tsx src/components/admin/tournament/GameDetailEditor.test.tsx
git commit -m "feat(tournament): improve game stat entry"
```

## Task 6: Final Verification and Regression

**Files:**
- No new source files expected.
- Verify: all files touched by Tasks 1-5.

- [ ] **Step 1: Run targeted unit tests**

Run:

```bash
npx vitest run \
  src/lib/tournament/match-detail-route.test.ts \
  src/lib/tournament/game-detail-service.test.ts \
  --project unit
```

Expected: PASS.

- [ ] **Step 2: Run targeted component tests**

Run:

```bash
npx vitest run \
  src/components/admin/tournament/game-detail-entry-utils.test.tsx \
  src/components/admin/tournament/GameDetailEditor.test.tsx \
  src/components/admin/tournament/ScoreDialog.test.tsx \
  src/components/admin/tournament/ScheduleTab.test.tsx \
  --project component
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npx vitest run
```

Expected: all test files pass.

- [ ] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected: build exits 0. Existing hook warnings in unrelated files may remain; do not introduce new warnings in touched files.

- [ ] **Step 6: Optional browser smoke for detailed entry**

If a local dev server is already running, open admin tournament UI and smoke the editor manually:

```bash
PORT=3103 npm run dev
```

Use the app to:
- Open a scheduled match score dialog.
- Click `+ 详细录入一局`.
- Apply standard BAN template before choosing blue side; verify blue side defaults to teamA.
- Fill KDA as `12/3/7`.
- Save a complete detail game and verify the request payload contains BAN + derived PICK.

Stop the dev server before ending the task.

- [ ] **Step 7: Commit any final test fixes**

If Task 6 required small test-only fixes, commit them:

```bash
git add src/components/admin/tournament src/lib/tournament
git commit -m "test(tournament): verify game detail entry UX"
```

If no files changed during Task 6, skip this commit.

## Self-Review Checklist

- Spec §4.1-§4.5 champion source and PICK derivation: Task 1 helper tests and Task 4 UI wiring.
- Spec §4.4 legacy PICK protection: Task 1 `buildBansPayload` tests and Task 4 `preserves legacy PICK` component test.
- Spec §4.6 admin read model extension: Task 2 route test and implementation, Task 3 forwarding test.
- Spec §5 standard BAN template blue-side behavior: Task 1 helper test and Task 4 template UI step.
- Spec §6.1 KDA parsing: Task 1 `parseKda` tests and Task 5 payload test.
- Spec §6.2 keyboard flow: Task 5 Enter-to-next-row test and handler.
- Spec §6.3 incomplete stats highlighter: Task 5 partial stats blocking test and error state.
- Spec §7 public `MatchDetailView` unchanged: no task edits public detail files.
- Spec §8 tests: every listed test class is covered by Tasks 1-5.

Placeholder scan: this plan contains no forbidden placeholder tokens or open-ended implementation instructions. Every implementation task lists concrete files, code shapes, commands, and expected results.

Type consistency check: `BanRowDraft`, `PickDraft`, `StatRowDraft`, `buildBansPayload`, `buildStandardBanRows`, and `parseKda` are defined in Task 1 and used with the same names in later tasks.
