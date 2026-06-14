import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameDetailEditor, type Props } from './GameDetailEditor';

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

vi.mock('./ChampionSelect', () => ({
  ChampionSelect: ({ value, onChange }: { value: string | null; onChange: (v: string) => void }) => (
    <select
      aria-label="英雄"
      data-testid="champion-select"
      role="combobox"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">选择英雄</option>
      {Array.from({ length: 40 }, (_, i) => (
        <option key={i} value={`Champion${i}`}>Champion{i}</option>
      ))}
      <option value="Ahri">Ahri</option>
      <option value="Garen">Garen</option>
      <option value="Lux">Lux</option>
    </select>
  ),
}));

function players(prefix: string) {
  return Array.from({ length: 5 }, (_, i) => ({
    registrationId: `${prefix}-${i}`,
    nickname: `${prefix}选手${i}`,
  }));
}

function props(overrides: Partial<Props> = {}): Props {
  return {
    open: true,
    onClose: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
    match: {
      id: 'match-1',
      version: 3,
      bestOf: 3,
      teamA: { id: 'team-a', name: 'A 队' },
      teamB: { id: 'team-b', name: 'B 队' },
    },
    rosters: [
      { teamId: 'team-a', players: players('A') },
      { teamId: 'team-b', players: players('B') },
    ],
    ...overrides,
  };
}

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, gameId: 'game-1' }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

function chooseStatChampions() {
  const heroSelects = screen.getAllByTestId('champion-select');
  const statHeroSelects = heroSelects.slice(-10);
  statHeroSelects.forEach((select, i) => {
    fireEvent.change(select, { target: { value: `Champion${i}` } });
  });
}

function completePlayerStats() {
  return [
    ...players('A').map((player, i) => ({
      teamId: 'team-a',
      registrationId: player.registrationId,
      championId: `Champion${i}`,
      kills: 1,
      deaths: 2,
      assists: 3,
      cs: 100,
      damage: 10000,
      gold: 9000,
    })),
    ...players('B').map((player, i) => ({
      teamId: 'team-b',
      registrationId: player.registrationId,
      championId: `Champion${i + 5}`,
      kills: 1,
      deaths: 2,
      assists: 3,
      cs: 100,
      damage: 10000,
      gold: 9000,
    })),
  ];
}

describe('GameDetailEditor BP payload', () => {
  it('shows only BAN rows and no manual PICK selector', () => {
    render(<GameDetailEditor {...props()} initial={{
      id: 'game-1',
      index: 1,
      isDraft: false,
      winnerTeamId: 'team-a',
      hasBans: true,
      hasStats: false,
      bans: [
        { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
        { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 2 },
      ],
    }} />);

    const selectedChampions = screen
      .getAllByTestId('champion-select')
      .map((select) => (select as HTMLSelectElement).value);
    expect(selectedChampions).toContain('Ahri');
    expect(selectedChampions).not.toContain('Garen');
    expect(screen.queryByRole('option', { name: 'PICK' })).not.toBeInTheDocument();
  });

  it('sends BAN rows plus 10 derived PICK rows when stats are complete', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /添加 BAN/ }));
    fireEvent.change(screen.getAllByTestId('champion-select')[0], { target: { value: 'Champion10' } });
    chooseStatChampions();

    for (const input of screen.getAllByLabelText('KDA')) fireEvent.change(input, { target: { value: '1/2/3' } });
    for (const input of screen.getAllByLabelText('CS')) fireEvent.change(input, { target: { value: '100' } });
    for (const input of screen.getAllByLabelText('伤害')) fireEvent.change(input, { target: { value: '10000' } });
    for (const input of screen.getAllByLabelText('金币')) fireEvent.change(input, { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toHaveLength(11);
    expect(body.detail.bans[0]).toEqual({ teamId: 'team-a', type: 'BAN', championId: 'Champion10', order: 1 });
    expect(body.detail.bans.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PICK', order: 2 }),
      expect.objectContaining({ type: 'PICK', order: 11 }),
    ]));
  });

  it('preserves legacy PICK rows when editing BAN without complete stats', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: false,
        bans: [
          { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
          { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 2 },
        ],
      },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /添加 BAN/ }));
    fireEvent.change(screen.getAllByTestId('champion-select')[1], { target: { value: 'Lux' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toEqual([
      { teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 },
      { teamId: 'team-a', type: 'BAN', championId: 'Lux', order: 2 },
      { teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 3 },
    ]);
  });

  it('clears legacy PICK only when BP is explicitly cleared', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: false,
        bans: [{ teamId: 'team-b', type: 'PICK', championId: 'Garen', order: 1 }],
      },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: '整段清空 BP' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail.bans).toBeNull();
  });

  it('blocks duplicate champions between untouched BAN and derived PICK rows', () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: false,
        bans: [{ teamId: 'team-a', type: 'BAN', championId: 'Ahri', order: 1 }],
      },
    })} />);

    const statHeroSelects = screen.getAllByTestId('champion-select').slice(-10);
    statHeroSelects.forEach((select, i) => {
      fireEvent.change(select, { target: { value: i === 0 ? 'Ahri' : `Champion${i}` } });
    });
    for (const input of screen.getAllByLabelText('KDA')) fireEvent.change(input, { target: { value: '1/2/3' } });
    for (const input of screen.getAllByLabelText('CS')) fireEvent.change(input, { target: { value: '100' } });
    for (const input of screen.getAllByLabelText('伤害')) fireEvent.change(input, { target: { value: '10000' } });
    for (const input of screen.getAllByLabelText('金币')) fireEvent.change(input, { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('同局英雄不可重复：Ahri');
  });

  it('does not rewrite BP when complete preloaded stats are untouched', async () => {
    const fetchMock = okFetch();
    render(<GameDetailEditor {...props({
      gameId: 'game-1',
      initial: {
        id: 'game-1',
        index: 1,
        isDraft: false,
        winnerTeamId: 'team-a',
        hasBans: true,
        hasStats: true,
        durationSeconds: 90,
        bans: [{ teamId: 'team-a', type: 'BAN', championId: 'Lux', order: 1 }],
        playerStats: completePlayerStats(),
      },
    })} />);

    fireEvent.change(screen.getByPlaceholderText('分'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('秒'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.detail).toMatchObject({ durationSeconds: 130 });
    expect(body.detail.bans).toBeUndefined();
    expect(body.detail.playerStats).toBeUndefined();
  });
});
