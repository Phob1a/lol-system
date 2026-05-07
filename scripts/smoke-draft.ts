// End-to-end smoke for the draft engine.
// Seeds 3 captains + 12 normal players, then walks 4 rounds covering all 4 modes.
// Run: DATABASE_URL=postgresql://bytedance@localhost:5432/lol_system_test npx tsx scripts/smoke-draft.ts
import { PrismaClient, type Position } from '@prisma/client';
import {
  startDraft,
  resetDraft,
  startRound,
  submitPick,
  getDraftSnapshot,
  revokePick,
  rewindRound,
  rearrangeSlots,
} from '../src/lib/draft/engine';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('[smoke] ❌ ASSERT FAILED:', msg);
    process.exit(1);
  }
}

async function main() {
  const prisma = new PrismaClient();
  console.log('[smoke] DATABASE_URL=', process.env.DATABASE_URL);

  // ─────────── Reset ───────────
  await prisma.draftSession.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.config.upsert({
    where: { id: 1 },
    create: { id: 1, teamBudget: 1000, draftLocked: false, extras: {} },
    update: { teamBudget: 1000, draftLocked: false },
  });

  // ─────────── Seed ───────────
  const adminUser = await prisma.user.create({
    data: { gameId: 'admin', passwordHash: 'fake', role: 'ADMIN', mustChangePwd: false },
  });

  const captainSpecs = [
    { gameId: 'cap1', nickname: '一队长', primary: 'MID' as Position, cost: 200 },
    { gameId: 'cap2', nickname: '二队长', primary: 'JUNGLE' as Position, cost: 200 },
    { gameId: 'cap3', nickname: '三队长', primary: 'TOP' as Position, cost: 200 },
  ];
  const captains = [];
  for (const c of captainSpecs) {
    const u = await prisma.user.create({
      data: { gameId: c.gameId, passwordHash: 'fake', role: 'CAPTAIN', mustChangePwd: false },
    });
    const p = await prisma.player.create({
      data: {
        gameId: c.gameId,
        nickname: c.nickname,
        primaryPositions: [c.primary],
        secondaryPositions: [],
        cost: c.cost,
        isCaptain: true,
        isRetired: false,
        userId: u.id,
      },
    });
    captains.push(p);
  }

  // 12 normal players
  const players = [];
  for (let i = 1; i <= 12; i++) {
    const u = await prisma.user.create({
      data: { gameId: `p${i}`, passwordHash: 'fake', role: 'CAPTAIN', mustChangePwd: false },
    });
    const p = await prisma.player.create({
      data: {
        gameId: `p${i}`,
        nickname: `选手${i}`,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        cost: 50,
        isCaptain: false,
        isRetired: false,
        userId: u.id,
      },
    });
    players.push(p);
  }
  console.log('[smoke] seeded admin + 3 captains + 12 players');

  // ─────────── Start draft ───────────
  await startDraft(adminUser.id);
  let snap = await getDraftSnapshot();
  assert(snap.session?.status === 'IN_PROGRESS', 'session not IN_PROGRESS after startDraft');
  assert(snap.teams.length === 3, '3 teams expected');
  assert(snap.session?.currentRound === 0, 'currentRound 0 after startDraft');
  console.log('[smoke] ✅ draft started; teams=3, round=0, seq=', snap.seq);

  const cap1Id = captains[0].id;
  const cap2Id = captains[1].id;
  const cap3Id = captains[2].id;
  const teamByCaptain = new Map(snap.teams.map((t) => [t.captainId, t]));

  // ─────────── Round 1: ADMIN_ORDER ───────────
  // Order: cap1, cap2, cap3 → each picks one player at TOP/TOP/JUNGLE
  // (cap1 captain MID → free TOP; cap2 captain JUNGLE → free TOP; cap3 captain TOP → free JUNGLE)
  console.log('\n[smoke] === Round 1: ADMIN_ORDER ===');
  let r1 = await startRound({
    mode: 'ADMIN_ORDER',
    adminProvidedOrder: [cap1Id, cap2Id, cap3Id],
    actorUserId: adminUser.id,
  });
  assert(r1.roundNo === 1, 'round 1 roundNo');
  assert(JSON.stringify(r1.pickOrder) === JSON.stringify([cap1Id, cap2Id, cap3Id]), 'r1 order');
  snap = await getDraftSnapshot();
  assert(snap.session?.onTheClock === cap1Id, 'cap1 on the clock');

  await submitPick({ byCaptainId: cap1Id, playerId: players[0].id, position: 'TOP', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  assert(snap.session?.onTheClock === cap2Id, 'cap2 on the clock after cap1 pick');
  await submitPick({ byCaptainId: cap2Id, playerId: players[1].id, position: 'TOP', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  assert(snap.session?.onTheClock === cap3Id, 'cap3 on the clock');
  await submitPick({ byCaptainId: cap3Id, playerId: players[2].id, position: 'JUNGLE', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  assert(snap.session?.onTheClock === null, 'no one on clock after round 1 last pick');
  assert(snap.pickedPlayerIds.length === 3, '3 picks after round 1');
  console.log('[smoke] ✅ round 1 done; picked=3, budgets=', snap.teams.map((t) => `${t.captainNickname}=${t.budgetLeft}`));

  // ─────────── Round 2: REVERSE_LAST → cap3, cap2, cap1 ───────────
  console.log('\n[smoke] === Round 2: REVERSE_LAST ===');
  let r2 = await startRound({ mode: 'REVERSE_LAST', actorUserId: adminUser.id });
  assert(JSON.stringify(r2.pickOrder) === JSON.stringify([cap3Id, cap2Id, cap1Id]), 'r2 reversed');
  snap = await getDraftSnapshot();
  assert(snap.session?.onTheClock === cap3Id, 'cap3 first in reverse');
  await submitPick({ byCaptainId: cap3Id, playerId: players[3].id, position: 'MID', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  await submitPick({ byCaptainId: cap2Id, playerId: players[4].id, position: 'MID', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  await submitPick({ byCaptainId: cap1Id, playerId: players[5].id, position: 'JUNGLE', expectedSeq: snap.seq, actorUserId: adminUser.id });
  snap = await getDraftSnapshot();
  assert(snap.pickedPlayerIds.length === 6, '6 total picks after round 2');
  console.log('[smoke] ✅ round 2 done');

  // ─────────── Round 3: BUDGET_DESC ───────────
  // After 2 rounds × 50 cost each, all teams have 800 - 100 = 700. All tied.
  // BUDGET_DESC will shuffle ties; we don't predict the order, just verify it's a permutation.
  console.log('\n[smoke] === Round 3: BUDGET_DESC ===');
  let r3 = await startRound({ mode: 'BUDGET_DESC', actorUserId: adminUser.id });
  assert(r3.pickOrder.length === 3, 'r3 length 3');
  assert(new Set(r3.pickOrder).size === 3, 'r3 unique');
  for (const cid of r3.pickOrder) {
    assert([cap1Id, cap2Id, cap3Id].includes(cid), `r3 contains ${cid}`);
  }
  // Each team still in tie: just pick. We need to know which captain is on the clock each time.
  for (const cid of r3.pickOrder) {
    snap = await getDraftSnapshot();
    assert(snap.session?.onTheClock === cid, `${cid} on the clock in r3`);
    // Use ADC slot for each (always free at this point)
    const playerIdx = 6 + r3.pickOrder.indexOf(cid);
    await submitPick({ byCaptainId: cid, playerId: players[playerIdx].id, position: 'ADC', expectedSeq: snap.seq, actorUserId: adminUser.id });
  }
  snap = await getDraftSnapshot();
  assert(snap.pickedPlayerIds.length === 9, '9 total picks after round 3');
  console.log('[smoke] ✅ round 3 done');

  // ─────────── Round 4: MANUAL ───────────
  console.log('\n[smoke] === Round 4: MANUAL ===');
  // Each captain still has SUPPORT slot empty (everyone except cap3 — cap3 captain at TOP, MID/JUNGLE/ADC filled, SUPPORT empty).
  // Wait — cap1 captain MID, picked TOP/JUNGLE/ADC → SUPPORT empty. cap2 captain JUNGLE, picked TOP/MID/ADC → SUPPORT empty. cap3 captain TOP, picked JUNGLE/MID/ADC → SUPPORT empty.
  let r4 = await startRound({
    mode: 'MANUAL',
    manualAssignments: [
      { captainId: cap1Id, playerId: players[9].id, position: 'SUPPORT' },
      { captainId: cap2Id, playerId: players[10].id, position: 'SUPPORT' },
      { captainId: cap3Id, playerId: players[11].id, position: 'SUPPORT' },
    ],
    actorUserId: adminUser.id,
  });
  assert(r4.finishedDraft === true, 'r4 finished draft');
  snap = await getDraftSnapshot();
  assert(snap.session?.status === 'FINISHED', 'session FINISHED after round 4');
  assert(snap.pickedPlayerIds.length === 12, '12 total picks after round 4');

  // Each team: 5 slots filled (captain + 4 picks)
  for (const t of snap.teams) {
    const filled = t.slots.filter((s) => s.player !== null).length;
    assert(filled === 5, `${t.captainNickname} should have 5 filled slots, got ${filled}`);
  }
  console.log('[smoke] ✅ round 4 done; draft FINISHED; all teams have 5 players');

  // ─────────── Phase 6: revoke ───────────
  console.log('\n[smoke] === Phase 6: revoke ===');
  const cap2Round3Pick = await prisma.draftPick.findFirst({
    where: { byCaptainId: cap2Id, round: { roundNo: 3 } },
  });
  assert(cap2Round3Pick != null, 'cap2 has a round-3 pick');
  const beforeBudget = (await prisma.team.findUnique({ where: { captainId: cap2Id } }))!.budgetLeft;

  const revokeResult = await revokePick(cap2Round3Pick.id, adminUser.id);
  console.log('[smoke] revoked:', revokeResult);
  assert(revokeResult.newCurrentRound === 3, 'currentRound rewinds to 3');
  assert(revokeResult.newOnTheClock === cap2Id, 'onTheClock = cap2');

  snap = await getDraftSnapshot();
  assert(snap.session?.status === 'IN_PROGRESS', 'session back to IN_PROGRESS after revoke');
  assert(snap.session?.currentRound === 3, 'snapshot currentRound = 3');
  assert(snap.session?.onTheClock === cap2Id, 'snapshot onTheClock = cap2');

  const remainingRounds = await prisma.draftRound.findMany({ where: { sessionId: snap.session!.id } });
  assert(remainingRounds.length === 3, `3 rounds remain (got ${remainingRounds.length})`);
  const cap2After = (await prisma.team.findUnique({ where: { captainId: cap2Id } }))!.budgetLeft;
  console.log(`[smoke]   cap2 budget: ${beforeBudget} -> ${cap2After}`);
  assert(cap2After > beforeBudget, 'cap2 budget refunded');
  console.log('[smoke]   pickedPlayerIds count after revoke:', snap.pickedPlayerIds.length);
  assert(snap.pickedPlayerIds.length < 9, 'fewer picks than before revoke');
  console.log('[smoke] ✅ revoke cascades correctly');

  // ─────────── Phase 6: rewind ───────────
  console.log('\n[smoke] === Phase 6: rewind ===');
  const rewindResult = await rewindRound(adminUser.id);
  console.log('[smoke] rewound:', rewindResult);
  assert(rewindResult.newCurrentRound === 2, 'rewound to round 2');
  snap = await getDraftSnapshot();
  assert(snap.session?.currentRound === 2, 'currentRound=2');
  assert(snap.session?.onTheClock === null, 'onTheClock=null after rewind');
  assert(
    snap.pickedPlayerIds.length === 6,
    `6 picks after rewind to end of r2 (got ${snap.pickedPlayerIds.length})`,
  );
  console.log('[smoke] ✅ rewind correctly returns to end-of-previous-round');

  // ─────────── Phase 6: rearrange ───────────
  console.log('\n[smoke] === Phase 6: rearrange ===');
  const cap1Team = snap.teams.find((t) => t.captainId === cap1Id)!;
  const midSlot = cap1Team.slots.find((s) => s.position === 'MID')!;
  const topSlot = cap1Team.slots.find((s) => s.position === 'TOP')!;
  assert(midSlot.player?.id === cap1Id, 'cap1 at MID');
  assert(topSlot.player !== null && topSlot.player.id !== cap1Id, 'someone else at TOP');

  const desired = cap1Team.slots.map((s) => {
    if (s.position === 'MID') return { position: 'MID' as const, playerId: topSlot.player!.id };
    if (s.position === 'TOP') return { position: 'TOP' as const, playerId: cap1Id };
    return { position: s.position, playerId: s.player?.id ?? null };
  });
  const rearrangeResult = await rearrangeSlots(cap1Team.id, desired, adminUser.id);
  console.log('[smoke] rearranged:', rearrangeResult);
  snap = await getDraftSnapshot();
  const cap1AfterTeam = snap.teams.find((t) => t.captainId === cap1Id)!;
  const newMid = cap1AfterTeam.slots.find((s) => s.position === 'MID')!.player;
  const newTop = cap1AfterTeam.slots.find((s) => s.position === 'TOP')!.player;
  assert(newTop?.id === cap1Id, 'cap1 now at TOP');
  assert(newMid?.id === topSlot.player!.id, 'previous TOP player now at MID');
  console.log('[smoke] ✅ rearrange swaps slots correctly');

  // Cross-team rearrange should be rejected
  const cap2Team = snap.teams.find((t) => t.captainId === cap2Id)!;
  const cap2Captain = cap2Team.slots.find((s) => s.player?.id === cap2Id)!;
  const badDesired = cap1AfterTeam.slots.map((s) => {
    if (s.position === 'TOP') return { position: 'TOP' as const, playerId: cap2Captain.player!.id };
    return { position: s.position, playerId: s.player?.id ?? null };
  });
  let crossTeamRejected = false;
  try {
    await rearrangeSlots(cap1AfterTeam.id, badDesired, adminUser.id);
  } catch (e) {
    if ((e as Error).message.includes('本队')) crossTeamRejected = true;
  }
  assert(crossTeamRejected, 'cross-team player rearrange rejected');
  console.log('[smoke] ✅ cross-team rearrange rejected');

  // ─────────── Reset ───────────
  await resetDraft();
  const snap5 = await getDraftSnapshot();
  assert(snap5.session === null, 'session null after reset');
  assert(snap5.teams.length === 0, 'no teams after reset');
  console.log('[smoke] ✅ reset OK');

  await prisma.$disconnect();
  console.log('\n[smoke] ✅ ALL CHECKS PASSED');
}

main().catch((e) => {
  console.error('[smoke] FAILED:', e);
  process.exit(1);
});
