import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamPreview, RegistrationRef } from '@/lib/teams/preview';
import { DraggableTeamBoard } from './DraggableTeamBoard';

const captain: RegistrationRef = {
  id: 'captain-1',
  gameId: 'captain-a',
  nickname: 'Team Alpha',
  primaryPositions: ['TOP'],
  secondaryPositions: [],
  cost: 80,
  availability: '周末全天',
};

const team: TeamPreview & { id: string } = {
  id: 'team-1',
  captainId: captain.id,
  captainGameId: captain.gameId,
  captainNickname: captain.nickname,
  budgetLeft: 420,
  slots: [
    { position: 'TOP', player: captain },
    { position: 'JUNGLE', player: null },
    { position: 'MID', player: null },
    { position: 'ADC', player: null },
    { position: 'SUPPORT', player: null },
  ],
};

describe('DraggableTeamBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows team roster details when the own team board is hovered', () => {
    render(<DraggableTeamBoard team={team} seq={1} />);

    const trigger = screen.getByText('MINE · DRAG TO SWAP').closest('div');
    expect(trigger).not.toBeNull();

    fireEvent.mouseEnter(trigger!);
    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(screen.getByText('队伍详情')).toBeInTheDocument();
    expect(screen.getAllByText('@captain-a').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('空缺')).toHaveLength(4);
    expect(screen.getByText('420 CR')).toBeInTheDocument();
  });

  it('closes the team detail card on pointer down before dragging starts', () => {
    render(<DraggableTeamBoard team={team} seq={1} />);
    const trigger = screen.getByText('MINE · DRAG TO SWAP').closest('div')!;

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByText('队伍详情')).toBeInTheDocument();

    fireEvent.pointerDown(trigger);

    expect(screen.queryByText('队伍详情')).not.toBeInTheDocument();
  });

  it('marks empty slots as pick drop targets when pick dragging is enabled', () => {
    render(<DraggableTeamBoard team={team} seq={1} pickDropEnabled />);

    const jungle = screen.getByTestId('team-slot-drop-JUNGLE');
    expect(jungle).toHaveAttribute('data-pick-drop-enabled', 'true');
    expect(jungle).toHaveClass('border-dashed');

    const top = screen.getByTestId('team-slot-drop-TOP');
    expect(top).toHaveAttribute('data-pick-drop-enabled', 'false');
  });
});
