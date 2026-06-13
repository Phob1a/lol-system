import { describe, expect, it } from 'vitest';
import { resolveDraftPickDrop } from './drag-pick';

describe('resolveDraftPickDrop', () => {
  it('returns player and position for a pool-player dropped on an enabled empty slot', () => {
    expect(
      resolveDraftPickDrop(
        { type: 'pool-player', playerId: 'reg-1' },
        { position: 'MID', acceptsPick: true },
      ),
    ).toEqual({ playerId: 'reg-1', position: 'MID' });
  });

  it('ignores slot rearrange drags and disabled drop targets', () => {
    expect(
      resolveDraftPickDrop(
        { type: 'slot-player', position: 'TOP' },
        { position: 'MID', acceptsPick: true },
      ),
    ).toBeNull();

    expect(
      resolveDraftPickDrop(
        { type: 'pool-player', playerId: 'reg-1' },
        { position: 'MID', acceptsPick: false },
      ),
    ).toBeNull();
  });
});
