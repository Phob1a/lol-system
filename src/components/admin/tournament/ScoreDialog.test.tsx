import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { GameDetailInitial } from './GameDetailEditor';
import { ScoreDialog } from './ScoreDialog';

const editorSpy = vi.hoisted(() => vi.fn());

vi.mock('./GameDetailEditor', () => ({
  GameDetailEditor: (props: { open: boolean; initial: GameDetailInitial | null }) => {
    if (props.open) editorSpy(props.initial);
    return props.open ? <div data-testid="game-detail-editor" /> : null;
  },
}));

describe('ScoreDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    editorSpy.mockReset();
  });

  it('passes full existing game detail to GameDetailEditor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        match: {
          games: [
            {
              id: 'game-1',
              index: 1,
              isDraft: false,
              winnerTeamId: 'team-a',
              hasBans: true,
              hasStats: true,
              blueTeamId: 'team-b',
              durationSeconds: 1815,
              mvpRegistrationId: 'reg-a',
              bans: [{ teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 }],
              playerStats: [{
                teamId: 'team-a',
                registrationId: 'reg-a',
                championId: 'Garen',
                kills: 1,
                deaths: 2,
                assists: 3,
                cs: 100,
                damage: 1000,
                gold: 900,
              }],
            },
          ],
          rosters: [],
        },
      }),
    }));

    render(
      <ScoreDialog
        open
        onClose={vi.fn()}
        refetch={vi.fn()}
        match={{
          id: 'match-1',
          status: 'SCHEDULED',
          version: 4,
          bestOf: 3,
          winnerTeamId: null,
          teamA: { id: 'team-a', name: 'A 队' },
          teamB: { id: 'team-b', name: 'B 队' },
        }}
      />,
    );

    await screen.findByText('第 1 局');
    fireEvent.click(screen.getByRole('button', { name: '详细' }));

    await waitFor(() => expect(editorSpy).toHaveBeenCalled());
    expect(editorSpy.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      id: 'game-1',
      blueTeamId: 'team-b',
      durationSeconds: 1815,
      mvpRegistrationId: 'reg-a',
      bans: [{ teamId: 'team-b', type: 'BAN', championId: 'Ahri', order: 1 }],
      playerStats: [expect.objectContaining({ registrationId: 'reg-a', championId: 'Garen' })],
    }));
  });
});
