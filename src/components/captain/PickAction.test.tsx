// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { PickAction } from './PickAction';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const player: RegistrationRef = {
  id: 'reg-1',
  gameId: 'Summoner#1234',
  nickname: '中文MixedCase',
  primaryPositions: ['MID'],
  secondaryPositions: ['ADC'],
  cost: 20,
};

function renderPickAction(emptySlots: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']) {
  return render(
    <PickAction
      open
      onOpenChange={vi.fn()}
      onPicked={vi.fn()}
      player={player}
      emptySlots={emptySlots}
      budgetLeft={100}
      expectedSeq={1}
    />,
  );
}

describe('PickAction', () => {
  it('exposes position choices as a keyboard-operable radiogroup', () => {
    renderPickAction(['TOP', 'MID', 'ADC']);

    expect(screen.getByRole('radiogroup', { name: /assign position/i })).toBeInTheDocument();

    const top = screen.getByRole('radio', { name: /上单/ });
    const jungle = screen.getByRole('radio', { name: /打野/i });
    const mid = screen.getByRole('radio', { name: /中单/ });

    expect(jungle).toBeDisabled();

    fireEvent.click(top);
    expect(top).toBeChecked();

    fireEvent.keyDown(top, { key: 'ArrowRight' });

    expect(mid).toBeChecked();
    expect(mid).toHaveFocus();
  });
});
