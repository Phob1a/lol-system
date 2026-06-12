import { describe, expect, it } from 'vitest';
import { applyGroupDrop, getUnassignedTeamIds } from './group-assignment-drag';

describe('group assignment drag helpers', () => {
  it('derives unassigned teams from assignment slots', () => {
    expect(getUnassignedTeamIds(['t1', 't2', 't3'], [['t1', ''], ['t3', '']])).toEqual(['t2']);
  });

  it('assigns a pool team to an empty slot', () => {
    expect(
      applyGroupDrop(
        [['', ''], ['', '']],
        { teamId: 't1', from: 'pool' },
        { type: 'slot', groupIdx: 0, slotIdx: 1 },
      ),
    ).toEqual([
      ['', 't1'],
      ['', ''],
    ]);
  });

  it('puts the previous occupant back into the pool when a pool team drops on an occupied slot', () => {
    expect(
      applyGroupDrop(
        [['t2', ''], ['', '']],
        { teamId: 't1', from: 'pool' },
        { type: 'slot', groupIdx: 0, slotIdx: 0 },
      ),
    ).toEqual([
      ['t1', ''],
      ['', ''],
    ]);
  });

  it('moves a grouped team to an empty slot', () => {
    expect(
      applyGroupDrop(
        [['t1', ''], ['', '']],
        { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 },
        { type: 'slot', groupIdx: 1, slotIdx: 1 },
      ),
    ).toEqual([
      ['', ''],
      ['', 't1'],
    ]);
  });

  it('swaps two grouped teams when dropping on an occupied slot', () => {
    expect(
      applyGroupDrop(
        [['t1', ''], ['t2', '']],
        { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 },
        { type: 'slot', groupIdx: 1, slotIdx: 0 },
      ),
    ).toEqual([
      ['t2', ''],
      ['t1', ''],
    ]);
  });

  it('clears the source slot when dropping a grouped team back to the pool', () => {
    expect(
      applyGroupDrop(
        [['t1', ''], ['t2', '']],
        { teamId: 't1', from: 'slot', groupIdx: 0, slotIdx: 0 },
        { type: 'pool' },
      ),
    ).toEqual([
      ['', ''],
      ['t2', ''],
    ]);
  });
});
