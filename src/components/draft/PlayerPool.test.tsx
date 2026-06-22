import { act, fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
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
  availability: '周末全天',
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

  it('lays out player candidates in an auto-fitting grid', () => {
    render(<PlayerPool players={[player]} />);

    const grid = screen.getByTestId('player-pool-grid');
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    });
  });

  it('marks a player card as draggable when drag data is provided', () => {
    render(
      <DndContext>
        <PlayerPool
          players={[player]}
          getDragData={(p) => ({ type: 'pool-player', playerId: p.id })}
        />
      </DndContext>,
    );

    const card = screen.getByTestId('player-pool-card-p1');
    expect(card).toHaveAttribute('aria-roledescription', 'draggable');
    expect(card).toHaveClass('cursor-grab');
  });

  it('uses card double-click as the fallback pick action for draggable cards', () => {
    const onPickRequest = vi.fn();
    render(
      <DndContext>
        <PlayerPool
          players={[player]}
          getDragData={(p) => ({ type: 'pool-player', playerId: p.id })}
          onPickRequest={onPickRequest}
        />
      </DndContext>,
    );

    expect(screen.getByText('拖到空位')).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByTestId('player-pool-card-p1'));

    expect(onPickRequest).toHaveBeenCalledWith(player);
  });
});
