# Manual Knockout Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic group-stage closing with a manual drag-and-drop knockout seeding flow: group results decide who advances, admins decide where those qualified teams land in the knockout bracket.

**Architecture:** Split the current `closeGroupStage` behavior into a read-side seeding draft and a write-side confirmation service. Add a dedicated admin route and dialog, retire the automatic close-groups route, and keep existing knockout `MatchAdvancementEdge` winner propagation unchanged.

**Tech Stack:** Next.js App Router, Prisma, Vitest, React Testing Library, dnd-kit, existing tournament service/test helpers.

---

## File Structure

- Create `src/lib/tournament/knockout-seeding-service.ts`
  - Owns qualified-team calculation, first-round slot discovery, default seed-map draft, and manual confirmation.
- Create `src/lib/tournament/knockout-seeding-service.test.ts`
  - Service-level TDD for unfinished groups, ties, arbitrary valid placement, invalid teams, duplicates, missing slots, and advancement compatibility.
- Create `src/app/api/tournament/admin/knockout-seeding/route.ts`
  - `GET` returns seeding draft; `POST` confirms manual slots and publishes tournament invalidation.
- Modify `src/app/api/tournament/admin/close-groups/route.ts`
  - Retire old automatic endpoint with 410 after auth.
- Create `src/components/admin/tournament/knockout-seeding-drag.ts`
  - Pure drag state helper, modeled after `group-assignment-drag.ts`.
- Create `src/components/admin/tournament/knockout-seeding-drag.test.ts`
  - Pure tests for pool/slot/drop/swap behavior.
- Create `src/components/admin/tournament/KnockoutSeedingDialog.tsx`
  - Admin dialog with candidate pool, first-round slots, clear, auto-fill draft, and confirm.
- Create `src/components/admin/tournament/KnockoutSeedingDialog.test.tsx`
  - Component tests for rendering, payload submission, button state, and tie/error display.
- Modify `src/components/admin/tournament/ScheduleTab.tsx`
  - Replace direct close-groups POST with opening `KnockoutSeedingDialog`.
- Modify `src/components/admin/tournament/ScheduleTab.test.tsx`
  - Assert button opens seeding dialog and no longer calls close-groups directly.
- Modify `src/lib/tournament/bracket-service.ts`
  - Keep `closeGroupStage` as a compatibility helper for existing service tests, but implement it by calling `getKnockoutSeedingDraft` and `confirmKnockoutSeeding` with `defaultSlots`. The production route no longer exposes this automatic path.

## Task 1: Service Types And Qualified-Team Draft

**Files:**
- Create: `src/lib/tournament/knockout-seeding-service.ts`
- Create: `src/lib/tournament/knockout-seeding-service.test.ts`
- Modify: `src/lib/tournament/bracket-service.test.ts`

- [ ] **Step 1: Write failing service tests for draft generation**

Create `src/lib/tournament/knockout-seeding-service.test.ts`:

```ts
import { beforeEach, expect, it } from 'vitest';
import { resetDb, testDb } from '@/lib/test/db';
import { setupGroupStage } from './score-service.test-helpers';
import { recordGame } from './score-service';
import { getKnockoutSeedingDraft } from './knockout-seeding-service';

beforeEach(resetDb);

async function playAllGroupMatches(teamIds: string[]) {
  const groupMatches = await testDb.match.findMany({
    where: { groupId: { not: null } },
    orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
  });
  for (const gm of groupMatches) {
    const winner = [gm.teamAId!, gm.teamBId!].sort(
      (a, b) => teamIds.indexOf(a) - teamIds.indexOf(b),
    )[0];
    const fresh = (await testDb.match.findUnique({ where: { id: gm.id } }))!;
    await recordGame(testDb, {
      matchId: gm.id,
      expectedVersion: fresh.version,
      winnerTeamId: winner,
      actorUserId: 'u',
    });
  }
}

it('builds qualified candidates and first-round slots after all group matches finish', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);

  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  expect(draft.tournamentId).toBe(tournamentId);
  expect(draft.candidates.map((c) => c.seedLabel)).toEqual(['A1', 'A2', 'B1', 'B2']);
  expect(draft.candidates.map((c) => c.teamId)).toEqual([
    teamIds[0],
    teamIds[1],
    teamIds[4],
    teamIds[5],
  ]);
  expect(draft.slots).toHaveLength(4);
  expect(draft.slots.every((s) => s.roundKey === 'SF')).toBe(true);
  expect(draft.defaultSlots).toHaveLength(4);
});

it('rejects draft generation while a group match is still scheduled', async () => {
  const { tournamentId } = await setupGroupStage();

  await expect(getKnockoutSeedingDraft(testDb, tournamentId)).rejects.toThrow(/未完成/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-service.test.ts
```

Expected: FAIL because `./knockout-seeding-service` does not exist.

- [ ] **Step 3: Implement draft service**

Create `src/lib/tournament/knockout-seeding-service.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { groupKnockout } from './templates/group-knockout';
import { computeStandings } from './standings';
import { TournamentError } from './errors';
import { assertTournamentWritable } from './guards';
import type { Db, GroupKnockoutConfig } from './types';

export type KnockoutSeedCandidate = {
  teamId: string;
  teamName: string;
  groupName: string;
  groupIndex: number;
  rank: number;
  seedKey: string;
  seedLabel: string;
};

export type KnockoutSeedSlot = {
  matchId: string;
  matchLabel: string | null;
  roundKey: string;
  slot: 'A' | 'B';
  teamId: string | null;
};

export type KnockoutSeedAssignment = {
  matchId: string;
  slot: 'A' | 'B';
  teamId: string;
};

export type KnockoutSeedingDraft = {
  tournamentId: string;
  candidates: KnockoutSeedCandidate[];
  slots: KnockoutSeedSlot[];
  defaultSlots: KnockoutSeedAssignment[];
};

type LoadedTournament = Awaited<ReturnType<typeof loadTournamentForSeeding>>;

async function loadTournamentForSeeding(db: Db, tournamentId: string) {
  return db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      stages: {
        include: {
          groups: {
            include: {
              teams: { include: { team: { select: { id: true, name: true } } } },
            },
            orderBy: { name: 'asc' },
          },
          matches: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
}

function groupLetter(index: number): string {
  return 'ABCDEFGH'[index] ?? `G${index + 1}`;
}

function firstRoundKey(config: GroupKnockoutConfig): string {
  const advancing = config.groupCount * config.advancingPerGroup;
  if (advancing === 2) return 'FINAL';
  if (advancing === 4) return 'SF';
  if (advancing === 8) return 'QF';
  return 'R16';
}

function assertGroupStageTournament(t: NonNullable<LoadedTournament>): void {
  if (t.status !== 'GROUP_STAGE') {
    throw new TournamentError('INVALID_STATE', '当前状态不能进行淘汰赛排位');
  }
}

function buildCandidates(t: NonNullable<LoadedTournament>, config: GroupKnockoutConfig): KnockoutSeedCandidate[] {
  const groupStage = t.stages.find((s) => s.type === 'GROUP');
  if (!groupStage) throw new TournamentError('INVALID_STATE', '小组赛阶段不存在');

  const candidates: KnockoutSeedCandidate[] = [];
  for (let g = 0; g < groupStage.groups.length; g += 1) {
    const group = groupStage.groups[g];
    const groupMatches = groupStage.matches.filter((m) => m.groupId === group.id);
    if (groupMatches.some((m) => m.status === 'SCHEDULED')) {
      throw new TournamentError('INVALID_STATE', `${group.name} 组比赛未完成`);
    }
    const rows = computeStandings(
      group.teams.map((x) => x.teamId),
      groupMatches.map((m) => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        winnerTeamId: m.winnerTeamId,
        status: m.status,
        countsForStandings: m.countsForStandings,
      })),
    );
    for (let rank = 1; rank <= config.advancingPerGroup; rank += 1) {
      const row = rows[rank - 1];
      if (!row) throw new TournamentError('INVALID_STATE', `${group.name} 组出线名次不足`);
      if (row.tied) {
        throw new TournamentError('STANDINGS_TIED', `${group.name} 组名次并列无法出线，请安排加赛`);
      }
      const team = group.teams.find((x) => x.teamId === row.teamId)?.team;
      if (!team) throw new TournamentError('INVALID_STATE', '小组队伍快照不完整');
      candidates.push({
        teamId: row.teamId,
        teamName: team.name,
        groupName: group.name,
        groupIndex: g,
        rank,
        seedKey: `${g}-${rank}`,
        seedLabel: `${groupLetter(g)}${rank}`,
      });
    }
  }
  return candidates;
}

function buildSlots(t: NonNullable<LoadedTournament>, config: GroupKnockoutConfig): KnockoutSeedSlot[] {
  const koStage = t.stages.find((s) => s.type === 'KNOCKOUT');
  if (!koStage) throw new TournamentError('INVALID_STATE', '淘汰赛阶段不存在');
  const roundKey = firstRoundKey(config);
  return koStage.matches
    .filter((m) => m.roundKey === roundKey)
    .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'zh'))
    .flatMap((m) => [
      { matchId: m.id, matchLabel: m.label, roundKey, slot: 'A' as const, teamId: m.teamAId },
      { matchId: m.id, matchLabel: m.label, roundKey, slot: 'B' as const, teamId: m.teamBId },
    ]);
}

function buildDefaultSlots(
  t: NonNullable<LoadedTournament>,
  config: GroupKnockoutConfig,
  candidates: KnockoutSeedCandidate[],
): KnockoutSeedAssignment[] {
  const skeleton = groupKnockout.generate(config.groupCount * config.teamsPerGroup, config);
  const skeletonKo = skeleton.stages.find((s) => s.type === 'KNOCKOUT')!.matches;
  const koStage = t.stages.find((s) => s.type === 'KNOCKOUT')!;
  const dbIdByKey = new Map<string, string>();
  for (const sm of skeletonKo) {
    const dbMatch = koStage.matches.find((m) => m.roundKey === sm.roundKey && m.label === sm.label);
    if (!dbMatch) throw new TournamentError('INVALID_STATE', '淘汰赛骨架与库不一致');
    dbIdByKey.set(sm.key, dbMatch.id);
  }
  const teamIdBySeedKey = new Map(candidates.map((c) => [c.seedKey, c.teamId]));
  return Object.entries(skeleton.seedMap).map(([seedKey, target]) => ({
    matchId: dbIdByKey.get(target.matchKey)!,
    slot: target.slot,
    teamId: teamIdBySeedKey.get(seedKey)!,
  }));
}

export async function getKnockoutSeedingDraft(db: Db, tournamentId: string): Promise<KnockoutSeedingDraft> {
  const t = await loadTournamentForSeeding(db, tournamentId);
  if (!t) throw new TournamentError('TOURNAMENT_NOT_FOUND', '赛事不存在');
  assertGroupStageTournament(t);
  await assertTournamentWritable(db, t.id);
  const config = groupKnockout.validate(t.config);
  const candidates = buildCandidates(t, config);
  const slots = buildSlots(t, config);
  return {
    tournamentId: t.id,
    candidates,
    slots,
    defaultSlots: buildDefaultSlots(t, config, candidates),
  };
}
```

- [ ] **Step 4: Run draft tests and verify they pass**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-service.test.ts
```

Expected: PASS for the first two tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/knockout-seeding-service.ts src/lib/tournament/knockout-seeding-service.test.ts
git commit -m "feat(tournament): add knockout seeding draft service"
```

## Task 2: Manual Seeding Confirmation Service

**Files:**
- Modify: `src/lib/tournament/knockout-seeding-service.ts`
- Modify: `src/lib/tournament/knockout-seeding-service.test.ts`
- Modify: `src/lib/tournament/bracket-service.test.ts`
- Modify: `src/lib/tournament/bracket-service.ts`

- [ ] **Step 1: Add failing confirmation tests**

Append to `src/lib/tournament/knockout-seeding-service.test.ts`:

```ts
import { confirmKnockoutSeeding } from './knockout-seeding-service';

it('confirms arbitrary qualified-team placement and moves tournament to KNOCKOUT', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);

  const manualSlots = [
    { matchId: draft.slots[0].matchId, slot: draft.slots[0].slot, teamId: teamIds[5] },
    { matchId: draft.slots[1].matchId, slot: draft.slots[1].slot, teamId: teamIds[0] },
    { matchId: draft.slots[2].matchId, slot: draft.slots[2].slot, teamId: teamIds[1] },
    { matchId: draft.slots[3].matchId, slot: draft.slots[3].slot, teamId: teamIds[4] },
  ];

  await confirmKnockoutSeeding(testDb, {
    tournamentId,
    slots: manualSlots,
    actorUserId: 'u',
  });

  expect((await testDb.tournament.findUnique({ where: { id: tournamentId } }))!.status).toBe('KNOCKOUT');
  const firstMatch = (await testDb.match.findUnique({ where: { id: draft.slots[0].matchId } }))!;
  expect([firstMatch.teamAId, firstMatch.teamBId]).toEqual([teamIds[5], teamIds[0]]);
});

it('rejects duplicate teams, missing slots, and non-qualified teams', async () => {
  const { tournamentId, teamIds } = await setupGroupStage();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, tournamentId);
  const validSlots = draft.defaultSlots;

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: [
        validSlots[0],
        { ...validSlots[1], teamId: validSlots[0].teamId },
        validSlots[2],
        validSlots[3],
      ],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/重复/);

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: validSlots.slice(0, 3),
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/槽位/);

  await expect(
    confirmKnockoutSeeding(testDb, {
      tournamentId,
      slots: [{ ...validSlots[0], teamId: teamIds[7] }, ...validSlots.slice(1)],
      actorUserId: 'u',
    }),
  ).rejects.toThrow(/出线/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-service.test.ts
```

Expected: FAIL because `confirmKnockoutSeeding` is not exported.

- [ ] **Step 3: Implement confirmation**

Append to `src/lib/tournament/knockout-seeding-service.ts`:

```ts
import { writeAudit } from './audit';

function slotKey(slot: Pick<KnockoutSeedAssignment, 'matchId' | 'slot'>): string {
  return `${slot.matchId}:${slot.slot}`;
}

export async function confirmKnockoutSeeding(
  db: PrismaClient,
  input: { tournamentId: string; slots: KnockoutSeedAssignment[]; actorUserId: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const draft = await getKnockoutSeedingDraft(tx, input.tournamentId);
    const expectedSlotKeys = new Set(draft.slots.map(slotKey));
    const submittedSlotKeys = new Set(input.slots.map(slotKey));
    if (submittedSlotKeys.size !== input.slots.length) {
      throw new TournamentError('VALIDATION', '淘汰赛槽位重复提交');
    }
    if (
      expectedSlotKeys.size !== submittedSlotKeys.size ||
      [...expectedSlotKeys].some((key) => !submittedSlotKeys.has(key))
    ) {
      throw new TournamentError('VALIDATION', '淘汰赛首轮槽位必须全部填满');
    }

    const candidateIds = new Set(draft.candidates.map((c) => c.teamId));
    const seenTeamIds = new Set<string>();
    for (const slot of input.slots) {
      if (!candidateIds.has(slot.teamId)) {
        throw new TournamentError('VALIDATION', '只能选择已出线队伍进入淘汰赛');
      }
      if (seenTeamIds.has(slot.teamId)) {
        throw new TournamentError('VALIDATION', '同一支队伍不能重复进入淘汰赛槽位');
      }
      seenTeamIds.add(slot.teamId);
    }

    for (const slot of input.slots) {
      await tx.match.update({
        where: { id: slot.matchId },
        data: slot.slot === 'A' ? { teamAId: slot.teamId } : { teamBId: slot.teamId },
      });
    }
    await tx.tournament.update({ where: { id: input.tournamentId }, data: { status: 'KNOCKOUT' } });
    await writeAudit(tx, {
      userId: input.actorUserId,
      action: 'tournament.knockout.seed.confirm',
      entity: 'Tournament',
      entityId: input.tournamentId,
      payload: {
        slots: input.slots,
        candidates: draft.candidates.map((c) => ({ teamId: c.teamId, seedLabel: c.seedLabel })),
      },
    });
  });
}
```

Move `import { writeAudit } from './audit';` to the top import block; do not leave an import in the middle of the file.

- [ ] **Step 4: Update old bracket test**

Modify `src/lib/tournament/bracket-service.test.ts` so it imports the new service:

```ts
import { getKnockoutSeedingDraft, confirmKnockoutSeeding } from './knockout-seeding-service';
```

Replace the old automatic fill test with:

```ts
it('手动排位：可用非 seedMap 对阵进入 KNOCKOUT', async () => {
  const { t, teamIds } = await setup();
  await playAllGroupMatches(teamIds);
  const draft = await getKnockoutSeedingDraft(testDb, t.id);
  await confirmKnockoutSeeding(testDb, {
    tournamentId: t.id,
    slots: [
      { matchId: draft.slots[0].matchId, slot: draft.slots[0].slot, teamId: teamIds[5] },
      { matchId: draft.slots[1].matchId, slot: draft.slots[1].slot, teamId: teamIds[0] },
      { matchId: draft.slots[2].matchId, slot: draft.slots[2].slot, teamId: teamIds[1] },
      { matchId: draft.slots[3].matchId, slot: draft.slots[3].slot, teamId: teamIds[4] },
    ],
    actorUserId: 'u',
  });

  const status = (await testDb.tournament.findUnique({ where: { id: t.id } }))!.status;
  expect(status).toBe('KNOCKOUT');
  const sfs = await testDb.match.findMany({ where: { roundKey: 'SF' }, orderBy: { label: 'asc' } });
  expect(sfs.map((m) => [m.teamAId, m.teamBId])).toEqual([
    [teamIds[5], teamIds[0]],
    [teamIds[1], teamIds[4]],
  ]);
});
```

- [ ] **Step 5: Rewire bracket-service compatibility helper**

Replace `src/lib/tournament/bracket-service.ts` with this wrapper so existing tests that need a quick KNOCKOUT setup still work through the new seeding service:

```ts
import type { PrismaClient } from '@prisma/client';
import { getKnockoutSeedingDraft, confirmKnockoutSeeding } from './knockout-seeding-service';

/**
 * Compatibility helper for tests and old internal callers.
 * Production UI/API must use manual knockout seeding, not this automatic default.
 */
export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const draft = await getKnockoutSeedingDraft(db, input.tournamentId);
  await confirmKnockoutSeeding(db, {
    tournamentId: input.tournamentId,
    slots: draft.defaultSlots,
    actorUserId: input.actorUserId,
  });
}
```

- [ ] **Step 6: Run service tests**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-service.test.ts src/lib/tournament/bracket-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament/knockout-seeding-service.ts src/lib/tournament/knockout-seeding-service.test.ts src/lib/tournament/bracket-service.ts src/lib/tournament/bracket-service.test.ts
git commit -m "feat(tournament): confirm manual knockout seeding"
```

## Task 3: Admin Routes And Retire Auto Close

**Files:**
- Create: `src/app/api/tournament/admin/knockout-seeding/route.ts`
- Modify: `src/app/api/tournament/admin/close-groups/route.ts`
- Create: `src/lib/tournament/knockout-seeding-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/lib/tournament/knockout-seeding-route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/tournament/admin/knockout-seeding/route';
import { POST as retiredCloseGroups } from '@/app/api/tournament/admin/close-groups/route';

vi.mock('@/lib/api-guards', () => ({
  requireAdmin: vi.fn(async () => ({
    session: { user: { id: 'admin-user', role: 'ADMIN' } },
    error: null,
  })),
}));

vi.mock('@/server/tournament-bus', () => ({
  publishTournament: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

vi.mock('@/lib/tournament/knockout-seeding-service', () => ({
  getKnockoutSeedingDraft: vi.fn(async () => ({
    tournamentId: 'tour-1',
    candidates: [],
    slots: [],
    defaultSlots: [],
  })),
  confirmKnockoutSeeding: vi.fn(async () => undefined),
}));

const service = await import('@/lib/tournament/knockout-seeding-service');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('knockout seeding admin route', () => {
  it('GET returns the seeding draft', async () => {
    const req = new NextRequest('http://localhost/api/tournament/admin/knockout-seeding?tournamentId=tour-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      draft: { tournamentId: 'tour-1', candidates: [], slots: [], defaultSlots: [] },
    });
    expect(service.getKnockoutSeedingDraft).toHaveBeenCalledWith(expect.anything(), 'tour-1');
  });

  it('POST confirms slots and publishes invalidation', async () => {
    const req = new NextRequest('http://localhost/api/tournament/admin/knockout-seeding', {
      method: 'POST',
      body: JSON.stringify({
        tournamentId: 'tour-1',
        slots: [{ matchId: 'm1', slot: 'A', teamId: 't1' }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(service.confirmKnockoutSeeding).toHaveBeenCalledWith(expect.anything(), {
      tournamentId: 'tour-1',
      slots: [{ matchId: 'm1', slot: 'A', teamId: 't1' }],
      actorUserId: 'admin-user',
    });
  });

  it('old close-groups route returns 410 after auth', async () => {
    const req = new NextRequest('http://localhost/api/tournament/admin/close-groups', {
      method: 'POST',
      body: JSON.stringify({ tournamentId: 'tour-1' }),
    });
    const res = await retiredCloseGroups(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: '自动收小组入口已退役，请使用手动淘汰赛排位' });
  });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-route.test.ts
```

Expected: FAIL because the new route does not exist and close-groups still auto-confirms.

- [ ] **Step 3: Implement new route**

Create `src/app/api/tournament/admin/knockout-seeding/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getKnockoutSeedingDraft, confirmKnockoutSeeding } from '@/lib/tournament/knockout-seeding-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const slotSchema = z.object({
  matchId: z.string().min(1),
  slot: z.enum(['A', 'B']),
  teamId: z.string().min(1),
});

const confirmSchema = z.object({
  tournamentId: z.string().min(1),
  slots: z.array(slotSchema),
});

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const tournamentId = req.nextUrl.searchParams.get('tournamentId');
  if (!tournamentId) return NextResponse.json({ error: '缺少 tournamentId' }, { status: 422 });
  try {
    const draft = await getKnockoutSeedingDraft(prisma, tournamentId);
    return NextResponse.json({ draft });
  } catch (e) {
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const body = confirmSchema.parse(await req.json());
    await confirmKnockoutSeeding(prisma, {
      tournamentId: body.tournamentId,
      slots: body.slots,
      actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
```

- [ ] **Step 4: Retire close-groups route**

Replace `src/app/api/tournament/admin/close-groups/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return NextResponse.json(
    { error: '自动收小组入口已退役，请使用手动淘汰赛排位' },
    { status: 410 },
  );
}
```

- [ ] **Step 5: Run route tests**

Run:

```bash
npx vitest run src/lib/tournament/knockout-seeding-route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tournament/admin/knockout-seeding/route.ts src/app/api/tournament/admin/close-groups/route.ts src/lib/tournament/knockout-seeding-route.test.ts
git commit -m "feat(api): add manual knockout seeding route"
```

## Task 4: Pure Drag Helper

**Files:**
- Create: `src/components/admin/tournament/knockout-seeding-drag.ts`
- Create: `src/components/admin/tournament/knockout-seeding-drag.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `src/components/admin/tournament/knockout-seeding-drag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyKnockoutSeedDrop, getUnassignedSeedCandidateIds } from './knockout-seeding-drag';

const slots = [
  { matchId: 'm1', slot: 'A' as const, teamId: null },
  { matchId: 'm1', slot: 'B' as const, teamId: 't1' },
  { matchId: 'm2', slot: 'A' as const, teamId: null },
];

describe('knockout seeding drag helpers', () => {
  it('returns candidates not currently assigned to slots', () => {
    expect(getUnassignedSeedCandidateIds(['t1', 't2', 't3'], slots)).toEqual(['t2', 't3']);
  });

  it('drops a pool team into an empty slot', () => {
    expect(
      applyKnockoutSeedDrop(slots, { teamId: 't2', from: 'pool' }, { type: 'slot', matchId: 'm1', slot: 'A' }),
    ).toEqual([
      { matchId: 'm1', slot: 'A', teamId: 't2' },
      { matchId: 'm1', slot: 'B', teamId: 't1' },
      { matchId: 'm2', slot: 'A', teamId: null },
    ]);
  });

  it('swaps two occupied slots and can clear a slot back to pool', () => {
    const occupied = [
      { matchId: 'm1', slot: 'A' as const, teamId: 't2' },
      { matchId: 'm1', slot: 'B' as const, teamId: 't1' },
    ];
    expect(
      applyKnockoutSeedDrop(occupied, { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'A' }, { type: 'slot', matchId: 'm1', slot: 'B' }),
    ).toEqual([
      { matchId: 'm1', slot: 'A', teamId: 't1' },
      { matchId: 'm1', slot: 'B', teamId: 't2' },
    ]);
    expect(
      applyKnockoutSeedDrop(occupied, { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'A' }, { type: 'pool' }),
    ).toEqual([
      { matchId: 'm1', slot: 'A', teamId: null },
      { matchId: 'm1', slot: 'B', teamId: 't1' },
    ]);
  });
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
npx vitest run src/components/admin/tournament/knockout-seeding-drag.test.ts
```

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement helper**

Create `src/components/admin/tournament/knockout-seeding-drag.ts`:

```ts
export type KnockoutSeedSlotState = {
  matchId: string;
  slot: 'A' | 'B';
  teamId: string | null;
};

export type KnockoutSeedDragSource =
  | { teamId: string; from: 'pool' }
  | { teamId: string; from: 'slot'; matchId: string; slot: 'A' | 'B' };

export type KnockoutSeedDropTarget =
  | { type: 'pool' }
  | { type: 'slot'; matchId: string; slot: 'A' | 'B' };

function sameSlot(a: Pick<KnockoutSeedSlotState, 'matchId' | 'slot'>, b: Pick<KnockoutSeedSlotState, 'matchId' | 'slot'>): boolean {
  return a.matchId === b.matchId && a.slot === b.slot;
}

export function getUnassignedSeedCandidateIds(teamIds: string[], slots: KnockoutSeedSlotState[]): string[] {
  const assigned = new Set(slots.map((s) => s.teamId).filter((x): x is string => x !== null));
  return teamIds.filter((id) => !assigned.has(id));
}

export function applyKnockoutSeedDrop(
  slots: KnockoutSeedSlotState[],
  source: KnockoutSeedDragSource,
  target: KnockoutSeedDropTarget | null | undefined,
): KnockoutSeedSlotState[] {
  if (!target) return slots;
  const next = slots.map((s) => ({ ...s }));

  const sourceSlot =
    source.from === 'slot'
      ? next.find((s) => s.matchId === source.matchId && s.slot === source.slot)
      : null;

  if (target.type === 'pool') {
    if (sourceSlot) sourceSlot.teamId = null;
    return next;
  }

  const targetSlot = next.find((s) => s.matchId === target.matchId && s.slot === target.slot);
  if (!targetSlot) return slots;
  if (sourceSlot && sameSlot(sourceSlot, targetSlot)) return slots;

  const displaced = targetSlot.teamId;
  targetSlot.teamId = source.teamId;
  if (sourceSlot) sourceSlot.teamId = displaced;

  return next.map((s) => {
    if (!sameSlot(s, targetSlot) && s.teamId === source.teamId) return { ...s, teamId: null };
    return s;
  });
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npx vitest run src/components/admin/tournament/knockout-seeding-drag.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/tournament/knockout-seeding-drag.ts src/components/admin/tournament/knockout-seeding-drag.test.ts
git commit -m "feat(ui): add knockout seeding drag helper"
```

## Task 5: KnockoutSeedingDialog Component

**Files:**
- Create: `src/components/admin/tournament/KnockoutSeedingDialog.tsx`
- Create: `src/components/admin/tournament/KnockoutSeedingDialog.test.tsx`

- [ ] **Step 1: Write failing dialog tests**

Create `src/components/admin/tournament/KnockoutSeedingDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnockoutSeedingDialog, type KnockoutSeedingDraft } from './KnockoutSeedingDialog';

const draft: KnockoutSeedingDraft = {
  tournamentId: 'tour-1',
  candidates: [
    { teamId: 't1', teamName: 'Alpha', seedLabel: 'A1', groupName: 'A', rank: 1 },
    { teamId: 't2', teamName: 'Bravo', seedLabel: 'A2', groupName: 'A', rank: 2 },
  ],
  slots: [
    { matchId: 'm1', matchLabel: '决赛', roundKey: 'FINAL', slot: 'A', teamId: 't1' },
    { matchId: 'm1', matchLabel: '决赛', roundKey: 'FINAL', slot: 'B', teamId: 't2' },
  ],
  defaultSlots: [
    { matchId: 'm1', slot: 'A', teamId: 't1' },
    { matchId: 'm1', slot: 'B', teamId: 't2' },
  ],
};

describe('KnockoutSeedingDialog', () => {
  it('renders candidates and submits filled slots', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const refetch = vi.fn(async () => {});
    const onClose = vi.fn();

    render(
      <KnockoutSeedingDialog
        open
        draft={draft}
        onClose={onClose}
        refetch={refetch}
      />,
    );

    expect(screen.getByText('A1 Alpha')).toBeInTheDocument();
    expect(screen.getByText('A2 Bravo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /确认进入淘汰赛/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournament/admin/knockout-seeding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: 'tour-1',
          slots: [
            { matchId: 'm1', slot: 'A', teamId: 't1' },
            { matchId: 'm1', slot: 'B', teamId: 't2' },
          ],
        }),
      });
    });
    expect(onClose).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  it('disables confirm when any slot is empty and supports auto-fill', () => {
    const emptyDraft = {
      ...draft,
      slots: [
        { ...draft.slots[0], teamId: null },
        { ...draft.slots[1], teamId: null },
      ],
    };
    render(<KnockoutSeedingDialog open draft={emptyDraft} onClose={vi.fn()} refetch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /确认进入淘汰赛/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /按排名自动填充/ }));
    expect(screen.getByRole('button', { name: /确认进入淘汰赛/ })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run dialog tests and verify failure**

Run:

```bash
npx vitest run src/components/admin/tournament/KnockoutSeedingDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement dialog**

Create `src/components/admin/tournament/KnockoutSeedingDialog.tsx`. Keep this first version button-based for testability, then wire drag interaction in Step 4:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import type { KnockoutSeedSlotState } from './knockout-seeding-drag';

export type KnockoutSeedingDraft = {
  tournamentId: string;
  candidates: Array<{ teamId: string; teamName: string; seedLabel: string; groupName: string; rank: number }>;
  slots: Array<{ matchId: string; matchLabel: string | null; roundKey: string; slot: 'A' | 'B'; teamId: string | null }>;
  defaultSlots: Array<{ matchId: string; slot: 'A' | 'B'; teamId: string }>;
};

type Props = {
  open: boolean;
  draft: KnockoutSeedingDraft | null;
  onClose: () => void;
  refetch: () => Promise<void>;
};

export function KnockoutSeedingDialog({ open, draft, onClose, refetch }: Props) {
  const [slots, setSlots] = useState<KnockoutSeedSlotState[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlots(draft?.slots.map((s) => ({ matchId: s.matchId, slot: s.slot, teamId: s.teamId })) ?? []);
  }, [draft]);

  const teamById = useMemo(() => new Map((draft?.candidates ?? []).map((c) => [c.teamId, c])), [draft]);
  const complete = slots.length > 0 && slots.every((s) => s.teamId !== null);

  function applyDefaultSlots() {
    if (!draft) return;
    setSlots(draft.slots.map((slot) => ({
      matchId: slot.matchId,
      slot: slot.slot,
      teamId: draft.defaultSlots.find((d) => d.matchId === slot.matchId && d.slot === slot.slot)?.teamId ?? null,
    })));
  }

  function clearSlots() {
    setSlots((prev) => prev.map((s) => ({ ...s, teamId: null })));
  }

  async function handleSubmit() {
    if (!draft || !complete) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tournament/admin/knockout-seeding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: draft.tournamentId,
          slots: slots.map((s) => ({ matchId: s.matchId, slot: s.slot, teamId: s.teamId! })),
        }),
      });
      if (res.ok) {
        toast.success('淘汰赛排位已确认');
        onClose();
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '确认失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>淘汰赛排位</DialogTitle>
          <DialogDescription>
            出线资格由小组赛成绩决定；槽位可由管理员自由排布。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <section className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-semibold">出线队</div>
            {draft.candidates.map((c) => (
              <div key={c.teamId} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {c.seedLabel} {c.teamName}
              </div>
            ))}
          </section>
          <section className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={applyDefaultSlots}>按排名自动填充</Button>
              <Button size="sm" variant="outline" onClick={clearSlots}>清空槽位</Button>
            </div>
            {draft.slots.reduce<Array<{ matchId: string; matchLabel: string | null; slots: typeof draft.slots }>>((acc, slot) => {
              const found = acc.find((m) => m.matchId === slot.matchId);
              if (found) found.slots.push(slot);
              else acc.push({ matchId: slot.matchId, matchLabel: slot.matchLabel, slots: [slot] });
              return acc;
            }, []).map((match) => (
              <div key={match.matchId} className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">{match.matchLabel ?? '淘汰赛'}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {match.slots.map((slot) => {
                    const state = slots.find((s) => s.matchId === slot.matchId && s.slot === slot.slot);
                    const team = state?.teamId ? teamById.get(state.teamId) : null;
                    return (
                      <div key={`${slot.matchId}-${slot.slot}`} className="rounded-md border border-dashed p-3 text-sm">
                        {slot.slot} 位：{team ? `${team.seedLabel} ${team.teamName}` : '空位'}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>取消</Button>
          <Button disabled={!complete || saving} onClick={() => void handleSubmit()}>
            <LoadingButtonContent loading={saving} loadingText="确认中…">确认进入淘汰赛</LoadingButtonContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire dnd-kit interaction**

Modify `KnockoutSeedingDialog.tsx` to import dnd-kit and the pure helper:

```tsx
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  applyKnockoutSeedDrop,
  getUnassignedSeedCandidateIds,
  type KnockoutSeedDragSource,
  type KnockoutSeedDropTarget,
} from './knockout-seeding-drag';
```

Add these small components to the same file:

```tsx
function CandidateChip({ candidate }: { candidate: KnockoutSeedingDraft['candidates'][number] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `seed-pool-${candidate.teamId}`,
    data: { teamId: candidate.teamId, from: 'pool' } satisfies KnockoutSeedDragSource,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={`rounded-md border bg-muted/30 px-3 py-2 text-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      {candidate.seedLabel} {candidate.teamName}
    </div>
  );
}

function SlotBox({
  slot,
  team,
}: {
  slot: KnockoutSeedSlotState;
  team: KnockoutSeedingDraft['candidates'][number] | null;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `seed-slot-${slot.matchId}-${slot.slot}`,
    data: { type: 'slot', matchId: slot.matchId, slot: slot.slot } satisfies KnockoutSeedDropTarget,
  });
  const draggable = useDraggable({
    id: `seed-slot-drag-${slot.matchId}-${slot.slot}`,
    disabled: !team,
    data: team
      ? ({ teamId: team.teamId, from: 'slot', matchId: slot.matchId, slot: slot.slot } satisfies KnockoutSeedDragSource)
      : undefined,
  });
  return (
    <div
      ref={(node) => {
        setDropRef(node);
        draggable.setNodeRef(node);
      }}
      {...draggable.listeners}
      {...draggable.attributes}
      className={`rounded-md border border-dashed p-3 text-sm ${isOver ? 'border-primary bg-primary/5' : ''}`}
    >
      {slot.slot} 位：{team ? `${team.seedLabel} ${team.teamName}` : '空位'}
    </div>
  );
}
```

Inside `KnockoutSeedingDialog`, add:

```tsx
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
const unassignedIds = getUnassignedSeedCandidateIds(draft.candidates.map((c) => c.teamId), slots);

function handleDragEnd(event: DragEndEvent) {
  const source = event.active.data.current as KnockoutSeedDragSource | undefined;
  const target = event.over?.data.current as KnockoutSeedDropTarget | undefined;
  if (!source || !target) return;
  setSlots((prev) => applyKnockoutSeedDrop(prev, source, target));
}
```

Wrap candidate/slot body with:

```tsx
<DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
  {/* pool + slots */}
</DndContext>
```

Render only unassigned pool candidates:

```tsx
{unassignedIds.map((id) => {
  const candidate = teamById.get(id)!;
  return <CandidateChip key={id} candidate={candidate} />;
})}
```

Use `<SlotBox slot={state!} team={team ?? null} />` for each slot display.

- [ ] **Step 5: Run dialog tests**

Run:

```bash
npx vitest run src/components/admin/tournament/KnockoutSeedingDialog.test.tsx src/components/admin/tournament/knockout-seeding-drag.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/tournament/KnockoutSeedingDialog.tsx src/components/admin/tournament/KnockoutSeedingDialog.test.tsx
git commit -m "feat(ui): add knockout seeding dialog"
```

## Task 6: Integrate ScheduleTab

**Files:**
- Modify: `src/components/admin/tournament/ScheduleTab.tsx`
- Modify: `src/components/admin/tournament/ScheduleTab.test.tsx`

- [ ] **Step 1: Add failing ScheduleTab test**

Append to `src/components/admin/tournament/ScheduleTab.test.tsx`:

```tsx
import { fireEvent, waitFor } from '@testing-library/react';

it('opens manual knockout seeding instead of directly posting close-groups', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/api/tournament/admin/knockout-seeding')) {
      return {
        ok: true,
        json: async () => ({
          draft: {
            tournamentId: 'tour-1',
            candidates: [],
            slots: [],
            defaultSlots: [],
          },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const s = state();
  s.matches = [
    match({ id: 'g1', groupId: 'group-1', status: 'FINISHED', scheduledAt: '2026-06-13T12:00:00.000Z' }),
  ];

  render(<ScheduleTab teams={[]} state={s} refetch={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /收小组进淘汰赛/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/tournament/admin/knockout-seeding?tournamentId=tour-1');
  });
  expect(fetchMock).not.toHaveBeenCalledWith('/api/tournament/admin/close-groups', expect.anything());
});
```

- [ ] **Step 2: Run ScheduleTab test and verify failure**

Run:

```bash
npx vitest run src/components/admin/tournament/ScheduleTab.test.tsx
```

Expected: FAIL because ScheduleTab still posts `/close-groups`.

- [ ] **Step 3: Modify ScheduleTab**

In `src/components/admin/tournament/ScheduleTab.tsx`, import the dialog:

```tsx
import { KnockoutSeedingDialog, type KnockoutSeedingDraft } from './KnockoutSeedingDialog';
```

Add state near the other dialog states:

```tsx
const [seedingDraft, setSeedingDraft] = useState<KnockoutSeedingDraft | null>(null);
const [seedingOpen, setSeedingOpen] = useState(false);
```

Replace `handleCloseGroups` with:

```tsx
async function handleOpenKnockoutSeeding() {
  if (!tournament) return;
  setClosingGroups(true);
  try {
    const res = await fetch(`/api/tournament/admin/knockout-seeding?tournamentId=${tournament.id}`);
    if (res.ok) {
      const data = await res.json();
      setSeedingDraft(data.draft as KnockoutSeedingDraft);
      setSeedingOpen(true);
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === 'STANDINGS_TIED') {
        toast.error(`积分并列：${data.error ?? '存在积分相同队伍，请先安排加赛决出排名'}`);
      } else {
        toast.error(data.error ?? '操作失败');
      }
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败');
  } finally {
    setClosingGroups(false);
  }
}
```

Change the button handler:

```tsx
<Button size="sm" disabled={closingGroups} onClick={() => void handleOpenKnockoutSeeding()}>
  <LoadingButtonContent loading={closingGroups} loadingText="处理中…">
    收小组进淘汰赛
  </LoadingButtonContent>
</Button>
```

Render the dialog near other dialogs:

```tsx
<KnockoutSeedingDialog
  open={seedingOpen}
  draft={seedingDraft}
  onClose={() => setSeedingOpen(false)}
  refetch={refetch}
/>
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npx vitest run src/components/admin/tournament/ScheduleTab.test.tsx src/components/admin/tournament/KnockoutSeedingDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/tournament/ScheduleTab.tsx src/components/admin/tournament/ScheduleTab.test.tsx
git commit -m "feat(ui): open manual seeding from schedule tab"
```

## Task 7: Full Regression And Docs Update

**Files:**
- Modify: `docs/superpowers/specs/2026-06-14-manual-knockout-seeding-design.md`

- [ ] **Step 1: Mark spec implemented**

Modify the header line in `docs/superpowers/specs/2026-06-14-manual-knockout-seeding-design.md`:

```markdown
日期：2026-06-14 ｜ 状态：implemented ｜ 前置：赛季-赛事物理合一已上线（b9aceac）
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npx vitest run \
  src/lib/tournament/knockout-seeding-service.test.ts \
  src/lib/tournament/knockout-seeding-route.test.ts \
  src/lib/tournament/bracket-service.test.ts \
  src/components/admin/tournament/knockout-seeding-drag.test.ts \
  src/components/admin/tournament/KnockoutSeedingDialog.test.tsx \
  src/components/admin/tournament/ScheduleTab.test.tsx
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
- `tsc`: exit 0
- `vitest`: all files pass
- `build`: exit 0; existing React hook warnings are acceptable if unchanged

- [ ] **Step 4: Commit docs and final verification state**

```bash
git add docs/superpowers/specs/2026-06-14-manual-knockout-seeding-design.md
git commit -m "docs: mark manual knockout seeding implemented"
```

- [ ] **Step 5: Final review checklist**

Before reporting completion, manually verify:

```text
[ ] Old /api/tournament/admin/close-groups no longer performs automatic seeding.
[ ] UI cannot skip manual seeding when closing group stage.
[ ] POST confirmation recomputes candidates and rejects stale/invalid front-end state.
[ ] Manual slots can violate old seedMap order by design.
[ ] Later knockout winner propagation still works because advancement edges are unchanged.
```

## Self-Review Notes

- Spec coverage: Tasks cover qualified candidate calculation, manual slot confirmation, route replacement, old public route retirement, drag UI, ScheduleTab integration, tests, and docs status.
- Placeholder scan: no unresolved implementation branch remains. The old close-groups route is explicitly retired with 410; the service helper remains only as a compatibility wrapper through the new confirmation path.
- Type consistency: `KnockoutSeedCandidate`, `KnockoutSeedSlot`, and `KnockoutSeedAssignment` are defined in the service and mirrored in the UI draft type. Route body uses the same slot assignment shape.
