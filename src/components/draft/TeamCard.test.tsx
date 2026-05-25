import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftTeamSnapshot } from '@/lib/draft/types';
import { TeamCard } from './TeamCard';

const team: DraftTeamSnapshot = {
  id: 'team-1',
  captainId: 'captain-1',
  captainGameId: 'captain-a',
  captainNickname: 'Team Alpha',
  budgetLeft: 420,
  slots: [
    {
      id: 'slot-top',
      position: 'TOP',
      registration: {
        id: 'reg-1',
        gameId: 'top-one',
        nickname: 'Top One',
        primaryPositions: ['TOP'],
        secondaryPositions: [],
        cost: 120,
      },
    },
    { id: 'slot-jungle', position: 'JUNGLE', registration: null },
    { id: 'slot-mid', position: 'MID', registration: null },
    { id: 'slot-adc', position: 'ADC', registration: null },
    { id: 'slot-support', position: 'SUPPORT', registration: null },
  ],
};

describe('TeamCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a roster detail card when the team card is hovered', () => {
    const { container } = render(<TeamCard team={team} live={false} maxBudget={1000} />);

    const trigger = container.firstElementChild;
    expect(trigger).not.toBeNull();

    fireEvent.mouseEnter(trigger!);
    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(screen.getByText('队伍详情')).toBeInTheDocument();
    expect(screen.getByText('@captain-a')).toBeInTheDocument();
    expect(screen.getByText('Top One')).toBeInTheDocument();
    expect(screen.getAllByText('空缺')).toHaveLength(4);
    expect(screen.getByText('420 CR')).toBeInTheDocument();
  });
});
