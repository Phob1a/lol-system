import { describe, expect, it } from 'vitest';
import { getLiveSignals, getLiveStats } from './live-arena';

describe('live arena helpers', () => {
  it('summarizes the live draft snapshot', () => {
    expect(
      getLiveStats({
        session: { status: 'FINISHED' },
        teams: [{ id: 't1' }],
        picks: [{ id: 'p1' }],
        pickedRegistrationIds: ['r1'],
      } as never),
    ).toEqual({
      teams: 1,
      picks: 1,
      pool: 1,
      status: 'FINISHED',
    });
  });

  it('builds HUD signals from the selected season and snapshot', () => {
    expect(
      getLiveSignals(
        { name: 'S1' } as never,
        {
          session: { status: 'IN_PROGRESS', currentRound: 2 },
          teams: [],
          picks: [],
          pickedRegistrationIds: [],
        } as never,
      ),
    ).toEqual([
      { label: 'SEASON', detail: 'S1' },
      { label: 'DRAFT', detail: 'IN_PROGRESS' },
      { label: 'ROUND', detail: '2' },
    ]);
  });
});
