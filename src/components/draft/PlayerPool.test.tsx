import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationForPool } from '@/lib/filters';
import { PlayerPool } from './PlayerPool';

const player: RegistrationForPool = {
  id: 'p1',
  gameId: 'pool-one',
  nickname: 'Pool One',
  primaryPositions: ['TOP'],
  secondaryPositions: ['MID'],
  cost: 100,
  isPicked: false,
};

describe('PlayerPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a player detail card when a row is hovered', () => {
    const { container } = render(<PlayerPool players={[player]} />);

    // PlayerHoverCard wraps each row in a <span style="display: contents">.
    const trigger = container.querySelector('[style*="display: contents"]');
    expect(trigger).not.toBeNull();

    fireEvent.mouseEnter(trigger!);
    act(() => {
      vi.advanceTimersByTime(160);
    });

    // PlayerInfoCard exposes "PRIMARY" / "COST" labels that the compact row does not.
    expect(screen.getByText('PRIMARY')).toBeInTheDocument();
    expect(screen.getByText('SECONDARY')).toBeInTheDocument();
    expect(screen.getByText('COST')).toBeInTheDocument();
  });
});
