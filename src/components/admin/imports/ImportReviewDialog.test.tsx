import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportReviewDialog } from './ImportReviewDialog';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function player(
  participantId: number,
  teamId: 100 | 200,
  name: string,
  win: boolean,
  kills: number,
) {
  return {
    participantId,
    teamId,
    name,
    championId: 103,
    championName: 'Ahri',
    stats: {
      participantId,
      win,
      kills,
      deaths: 2,
      assists: 3,
      totalMinionsKilled: 120,
      neutralMinionsKilled: 8,
      totalDamageDealtToChampions: 12345,
      goldEarned: 9876,
    },
  };
}

const rawJson = {
  gameMode: 'CLASSIC',
  gameType: 'CUSTOM_GAME',
  gameDuration: 1861,
  teams: [
    { teamId: 100, win: 'Win' },
    { teamId: 200, win: 'Fail' },
  ],
  players: [
    ...Array.from({ length: 5 }, (_, i) => player(i + 1, 100, `Blue${i + 1}`, true, i + 1)),
    ...Array.from({ length: 5 }, (_, i) => player(i + 6, 200, `Red${i + 1}`, false, i + 6)),
  ],
};

describe('ImportReviewDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('previews LCU pulled data before a site match is selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/tournament/admin/imports/import-1') {
        return {
          ok: true,
          json: async () => ({
            import: {
              id: 'import-1',
              source: 'SCRIPT',
              externalGameId: '739123',
              status: 'PENDING',
              gameMode: 'CLASSIC',
              gameType: 'CUSTOM_GAME',
              durationSeconds: 1861,
              rawJson,
            },
          }),
        };
      }
      if (url === '/api/tournament/admin/state') {
        return {
          ok: true,
          json: async () => ({
            state: {
              matches: [{
                id: 'match-1',
                version: 1,
                label: '决赛',
                scheduledAt: '2026-06-18T12:00:00.000Z',
                teamA: { id: 'team-a', name: 'A 队' },
                teamB: { id: 'team-b', name: 'B 队' },
                status: 'SCHEDULED',
                games: [],
              }],
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    render(
      <ImportReviewDialog
        importId="import-1"
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );

    expect(await screen.findByText('LCU 数据预览')).toBeInTheDocument();
    expect(screen.getByText('CLASSIC / CUSTOM_GAME')).toBeInTheDocument();
    expect(screen.getByText('31:01')).toBeInTheDocument();
    expect(screen.getAllByText('蓝方').length).toBeGreaterThan(0);
    expect(screen.getByText('Blue1')).toBeInTheDocument();
    expect(screen.getByText('Red1')).toBeInTheDocument();
    expect(screen.getByText('1/2/3')).toBeInTheDocument();
    expect(screen.getAllByText('128').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.queryByText('玩家映射')).not.toBeInTheDocument();
    });
  });
});
