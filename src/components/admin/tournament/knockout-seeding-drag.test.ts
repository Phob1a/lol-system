import { describe, expect, it } from 'vitest';
import {
  applyKnockoutSeedDrop,
  getUnassignedSeedCandidateIds,
  type KnockoutSeedSlotState,
} from './knockout-seeding-drag';

function slots(): KnockoutSeedSlotState[] {
  return [
    { matchId: 'm1', slot: 'A', teamId: null },
    { matchId: 'm1', slot: 'B', teamId: 't2' },
    { matchId: 'm2', slot: 'A', teamId: 't3' },
    { matchId: 'm2', slot: 'B', teamId: null },
  ];
}

describe('knockout seeding drag helpers', () => {
  it('derives unassigned seed candidate ids from slots', () => {
    expect(getUnassignedSeedCandidateIds(['t1', 't2', 't3', 't4'], slots())).toEqual(['t1', 't4']);
  });

  it('assigns a pool team to an empty slot without mutating input', () => {
    const before = slots();
    const originalFirst = before[0];

    const next = applyKnockoutSeedDrop(
      before,
      { teamId: 't1', from: 'pool' },
      { type: 'slot', matchId: 'm1', slot: 'A' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: 't1' },
      { matchId: 'm1', slot: 'B', teamId: 't2' },
      { matchId: 'm2', slot: 'A', teamId: 't3' },
      { matchId: 'm2', slot: 'B', teamId: null },
    ]);
    expect(before[0]).toBe(originalFirst);
    expect(before[0].teamId).toBeNull();
  });

  it('displaces an occupied slot when assigning from pool', () => {
    const next = applyKnockoutSeedDrop(
      slots(),
      { teamId: 't1', from: 'pool' },
      { type: 'slot', matchId: 'm1', slot: 'B' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: null },
      { matchId: 'm1', slot: 'B', teamId: 't1' },
      { matchId: 'm2', slot: 'A', teamId: 't3' },
      { matchId: 'm2', slot: 'B', teamId: null },
    ]);
  });

  it('removes the pool team from any other slot when assigning', () => {
    const next = applyKnockoutSeedDrop(
      slots(),
      { teamId: 't3', from: 'pool' },
      { type: 'slot', matchId: 'm1', slot: 'A' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: 't3' },
      { matchId: 'm1', slot: 'B', teamId: 't2' },
      { matchId: 'm2', slot: 'A', teamId: null },
      { matchId: 'm2', slot: 'B', teamId: null },
    ]);
  });

  it('swaps two occupied slots', () => {
    const next = applyKnockoutSeedDrop(
      slots(),
      { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'B' },
      { type: 'slot', matchId: 'm2', slot: 'A' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: null },
      { matchId: 'm1', slot: 'B', teamId: 't3' },
      { matchId: 'm2', slot: 'A', teamId: 't2' },
      { matchId: 'm2', slot: 'B', teamId: null },
    ]);
  });

  it('moves a slot team to an empty slot and clears the source', () => {
    const next = applyKnockoutSeedDrop(
      slots(),
      { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'B' },
      { type: 'slot', matchId: 'm2', slot: 'B' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: null },
      { matchId: 'm1', slot: 'B', teamId: null },
      { matchId: 'm2', slot: 'A', teamId: 't3' },
      { matchId: 'm2', slot: 'B', teamId: 't2' },
    ]);
  });

  it('clears the source slot when dropping a slot team to the pool', () => {
    const next = applyKnockoutSeedDrop(
      slots(),
      { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'B' },
      { type: 'pool' },
    );

    expect(next).toEqual([
      { matchId: 'm1', slot: 'A', teamId: null },
      { matchId: 'm1', slot: 'B', teamId: null },
      { matchId: 'm2', slot: 'A', teamId: 't3' },
      { matchId: 'm2', slot: 'B', teamId: null },
    ]);
  });

  it('returns original slots for missing target, unknown target slot, or same-slot drop', () => {
    const before = slots();

    expect(applyKnockoutSeedDrop(before, { teamId: 't1', from: 'pool' }, null)).toBe(before);
    expect(
      applyKnockoutSeedDrop(before, { teamId: 't1', from: 'pool' }, { type: 'slot', matchId: 'missing', slot: 'A' }),
    ).toBe(before);
    expect(
      applyKnockoutSeedDrop(
        before,
        { teamId: 't2', from: 'slot', matchId: 'm1', slot: 'B' },
        { type: 'slot', matchId: 'm1', slot: 'B' },
      ),
    ).toBe(before);
  });
});
