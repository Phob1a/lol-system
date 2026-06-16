import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { KnockoutSeedingDialog, type KnockoutSeedingDraft } from './KnockoutSeedingDialog';

const { dndState, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  dndState: {
    draggableData: new Map<string, unknown>(),
    droppableData: new Map<string, unknown>(),
    onDragEnd: null as null | ((event: { active: { data: { current: unknown } }; over: { data: { current: unknown } } | null }) => void),
  },
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: NonNullable<typeof dndState.onDragEnd>;
  }) => {
    dndState.onDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  useDraggable: (options: { id: string; data?: unknown; disabled?: boolean }) => {
    dndState.draggableData.set(options.id, options.data);
    return {
      attributes: { 'data-draggable-id': options.id },
      isDragging: false,
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
    };
  },
  useDroppable: (options: { id: string; data?: unknown }) => {
    dndState.droppableData.set(options.id, options.data);
    return {
      isOver: false,
      setNodeRef: vi.fn(),
    };
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

const draft: KnockoutSeedingDraft = {
  tournamentId: 'tour1',
  candidates: [
    { teamId: 'team-a1', teamName: '红队', seedLabel: 'A1', groupName: 'A', rank: 1 },
    { teamId: 'team-a2', teamName: '蓝队', seedLabel: 'A2', groupName: 'A', rank: 2 },
    { teamId: 'team-b1', teamName: '白队', seedLabel: 'B1', groupName: 'B', rank: 1 },
    { teamId: 'team-b2', teamName: '黑队', seedLabel: 'B2', groupName: 'B', rank: 2 },
  ],
  slots: [
    { matchId: 'sf1', matchLabel: '半决赛 1', roundKey: 'SF', slot: 'A', teamId: null },
    { matchId: 'sf1', matchLabel: '半决赛 1', roundKey: 'SF', slot: 'B', teamId: null },
    { matchId: 'sf2', matchLabel: '半决赛 2', roundKey: 'SF', slot: 'A', teamId: null },
    { matchId: 'sf2', matchLabel: '半决赛 2', roundKey: 'SF', slot: 'B', teamId: null },
  ],
  defaultSlots: [
    { matchId: 'sf1', slot: 'A', teamId: 'team-a1' },
    { matchId: 'sf1', slot: 'B', teamId: 'team-b2' },
    { matchId: 'sf2', slot: 'A', teamId: 'team-b1' },
    { matchId: 'sf2', slot: 'B', teamId: 'team-a2' },
  ],
};

describe('KnockoutSeedingDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    dndState.draggableData.clear();
    dndState.droppableData.clear();
    dndState.onDragEnd = null;
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  function triggerDrag(activeId: string, overId: string) {
    const active = dndState.draggableData.get(activeId);
    const over = dndState.droppableData.get(overId);
    if (!dndState.onDragEnd || !active || !over) throw new Error('Dnd test wiring missing');
    dndState.onDragEnd({
      active: { data: { current: active } },
      over: { data: { current: over } },
    });
  }

  it('renders candidates and submits filled slots with exact payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<KnockoutSeedingDialog open draft={draft} onClose={onClose} refetch={refetch} />);

    expect(screen.getByText('红队')).toBeInTheDocument();
    expect(screen.getByText('蓝队')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '按排名自动填充' }));
    fireEvent.click(screen.getByRole('button', { name: '确认排位' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/tournament/admin/knockout-seeding',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    ));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      tournamentId: 'tour1',
      slots: draft.defaultSlots,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refetch).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('淘汰赛排位已确认');
  });

  it('keeps confirm disabled until all slots are filled by auto-fill', () => {
    render(<KnockoutSeedingDialog open draft={draft} onClose={vi.fn()} refetch={vi.fn()} />);

    const confirm = screen.getByRole('button', { name: '确认排位' });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '按排名自动填充' }));

    expect(confirm).toBeEnabled();
  });

  it('resets local slot state when reopened with the same draft object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<KnockoutSeedingDialog open draft={draft} onClose={vi.fn()} refetch={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '按排名自动填充' }));
    expect(screen.getByRole('button', { name: '确认排位' })).toBeEnabled();

    rerender(<KnockoutSeedingDialog open={false} draft={draft} onClose={vi.fn()} refetch={vi.fn()} />);
    rerender(<KnockoutSeedingDialog open draft={draft} onClose={vi.fn()} refetch={vi.fn()} />);

    const confirm = screen.getByRole('button', { name: '确认排位' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('updates slot UI through dialog DnD source and target data', async () => {
    render(<KnockoutSeedingDialog open draft={draft} onClose={vi.fn()} refetch={vi.fn()} />);

    act(() => {
      triggerDrag('pool:team-a1', 'slot:sf1:A');
    });

    expect(await screen.findByLabelText('候选队伍池')).not.toHaveTextContent('红队');
    expect(screen.getByLabelText('sf1 A 槽位')).toHaveTextContent('红队');
  });

  it('shows API error without closing on failed confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: '席位不完整' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    const refetch = vi.fn().mockResolvedValue(undefined);

    render(<KnockoutSeedingDialog open draft={draft} onClose={onClose} refetch={refetch} />);

    fireEvent.click(screen.getByRole('button', { name: '按排名自动填充' }));
    fireEvent.click(screen.getByRole('button', { name: '确认排位' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('席位不完整'));
    expect(onClose).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });
});
