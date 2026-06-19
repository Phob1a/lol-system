import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tournament } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import { SpectatorView } from './SpectatorView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useDraftStream', () => ({
  useDraftStream: (snapshot: DraftSnapshot) => ({ snapshot }),
}));

const tournament = {
  id: 't1',
  name: '夏季赛',
  kind: 'GROUP_KNOCKOUT',
  status: 'DRAFTING',
  config: {},
  teamBudget: 1000,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  archivedAt: null,
} as Tournament;

const snapshot: DraftSnapshot = {
  session: {
    id: 's1',
    status: 'IN_PROGRESS',
    currentRound: 1,
    onTheClock: 'captain-1',
    seq: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
  },
  teams: [
    {
      id: 'team-1',
      captainId: 'captain-1',
      captainGameId: 'captain-a',
      captainNickname: '蓝队',
      budgetLeft: 800,
      slots: [
        { id: 'slot-top', position: 'TOP', registration: null },
        { id: 'slot-jungle', position: 'JUNGLE', registration: null },
        { id: 'slot-mid', position: 'MID', registration: null },
        { id: 'slot-adc', position: 'ADC', registration: null },
        { id: 'slot-support', position: 'SUPPORT', registration: null },
      ],
    },
  ],
  pickedRegistrationIds: [],
  picks: [],
  seq: 1,
};

describe('SpectatorView', () => {
  it('renders the live draft console shell around existing draft panels', () => {
    render(
      <SpectatorView
        tournaments={[tournament]}
        selectedTournament={tournament}
        initialSnapshot={snapshot}
        poolRegistrations={[]}
      />,
    );

    expect(screen.getByText('LOL-SYSTEM / LIVE DRAFT')).toBeInTheDocument();
    expect(screen.getByText('Live Draft Console')).toBeInTheDocument();
    expect(screen.getAllByText('队伍席位').length).toBeGreaterThan(0);
    expect(screen.getAllByText('选手池').length).toBeGreaterThan(0);
    expect(screen.getAllByText('事件流').length).toBeGreaterThan(0);
  });
});
