'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  applyKnockoutSeedDrop,
  getUnassignedSeedCandidateIds,
  type KnockoutSeedDragSource,
  type KnockoutSeedDropTarget,
  type KnockoutSeedSlotState,
} from './knockout-seeding-drag';
import NexusButton from '@/components/nexus/NexusButton';
import Kicker from '@/components/nexus/Kicker';

export type KnockoutSeedingDraft = {
  tournamentId: string;
  candidates: Array<{
    teamId: string;
    teamName: string;
    seedLabel: string;
    groupName: string;
    rank: number;
  }>;
  slots: Array<{
    matchId: string;
    matchLabel: string | null;
    roundKey: string;
    slot: 'A' | 'B';
    teamId: string | null;
  }>;
  defaultSlots: Array<{
    matchId: string;
    slot: 'A' | 'B';
    teamId: string;
  }>;
};

type Props = {
  open: boolean;
  draft: KnockoutSeedingDraft | null;
  onClose: () => void;
  refetch: () => Promise<void>;
};

type Candidate = KnockoutSeedingDraft['candidates'][number];

function slotKey(slot: Pick<KnockoutSeedSlotState, 'matchId' | 'slot'>): string {
  return `${slot.matchId}:${slot.slot}`;
}

export function KnockoutSeedingDialog({ open, draft, onClose, refetch }: Props) {
  const [slots, setSlots] = useState<KnockoutSeedSlotState[]>([]);
  const [saving, setSaving] = useState(false);

  const resetSlotsFromDraft = useCallback(() => {
    setSlots(draft?.slots.map((slot) => ({ matchId: slot.matchId, slot: slot.slot, teamId: slot.teamId })) ?? []);
  }, [draft]);

  useEffect(() => {
    if (open) resetSlotsFromDraft();
  }, [open, resetSlotsFromDraft]);

  const candidateById = useMemo(
    () => new Map((draft?.candidates ?? []).map((candidate) => [candidate.teamId, candidate])),
    [draft],
  );
  const unassignedCandidateIds = useMemo(
    () => getUnassignedSeedCandidateIds(draft?.candidates.map((candidate) => candidate.teamId) ?? [], slots),
    [draft, slots],
  );
  const matches = useMemo(() => {
    if (!draft) return [];
    const infoByMatchId = new Map(draft.slots.map((slot) => [slot.matchId, slot]));
    const seen = new Set<string>();
    return slots
      .filter((slot) => {
        if (seen.has(slot.matchId)) return false;
        seen.add(slot.matchId);
        return true;
      })
      .map((slot) => ({
        matchId: slot.matchId,
        label: infoByMatchId.get(slot.matchId)?.matchLabel ?? infoByMatchId.get(slot.matchId)?.roundKey ?? '首轮比赛',
        slots: slots.filter((item) => item.matchId === slot.matchId),
      }));
  }, [draft, slots]);
  const allFilled = slots.length > 0 && slots.every((slot) => slot.teamId !== null);

  function autoFill() {
    if (!draft) return;
    const byKey = new Map(draft.defaultSlots.map((assignment) => [slotKey(assignment), assignment.teamId]));
    setSlots((current) => current.map((slot) => ({ ...slot, teamId: byKey.get(slotKey(slot)) ?? null })));
  }

  function clearSlots() {
    setSlots((current) => current.map((slot) => ({ ...slot, teamId: null })));
  }

  function handleDragEnd(event: DragEndEvent) {
    const source = event.active.data.current as KnockoutSeedDragSource | undefined;
    const target = event.over?.data.current as KnockoutSeedDropTarget | undefined;
    if (!source) return;
    setSlots((current) => applyKnockoutSeedDrop(current, source, target));
  }

  async function submit() {
    if (!draft || !allFilled) return;
    setSaving(true);
    try {
      const payload = {
        tournamentId: draft.tournamentId,
        slots: slots.map((slot) => ({ matchId: slot.matchId, slot: slot.slot, teamId: slot.teamId! })),
      };
      const res = await fetch('/api/tournament/admin/knockout-seeding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? '确认排位失败');
        return;
      }
      toast.success('淘汰赛排位已确认');
      closeDialog();
      try {
        await refetch();
      } catch {
        toast.error('排位已确认，但刷新失败，请手动刷新页面');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '确认排位失败');
    } finally {
      setSaving(false);
    }
  }

  function closeDialog() {
    resetSlotsFromDraft();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeDialog(); }}>
      <DialogContent className="max-w-4xl bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">淘汰赛排位</DialogTitle>
          <DialogDescription className="sr-only">为淘汰赛首轮手动安排出线队伍</DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="rounded-[var(--radius-nexus)] border border-nexus-line/60 py-8 text-center font-mono text-[11px] text-nexus-faint">
            暂无排位草稿
          </div>
        ) : (
          <DndContext onDragEnd={handleDragEnd}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
              <SeedPool
                candidates={unassignedCandidateIds
                  .map((teamId) => candidateById.get(teamId))
                  .filter((candidate): candidate is Candidate => candidate !== undefined)}
              />

              <div className="space-y-3">
                {matches.map((match) => (
                  <div
                    key={match.matchId}
                    className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-3"
                  >
                    <Kicker className="mb-3">{match.label}</Kicker>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {match.slots.map((slot) => (
                        <SeedSlot
                          key={slotKey(slot)}
                          slot={slot}
                          candidate={slot.teamId ? candidateById.get(slot.teamId) : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DndContext>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <NexusButton disabled={!draft || saving} onClick={autoFill}>
              按排名自动填充
            </NexusButton>
            <NexusButton disabled={!draft || saving} onClick={clearSlots}>
              清空槽位
            </NexusButton>
          </div>
          <div className="flex gap-2">
            <NexusButton disabled={saving} onClick={closeDialog}>
              取消
            </NexusButton>
            <NexusButton
              variant="primary"
              disabled={!draft || !allFilled || saving}
              onClick={() => void submit()}
            >
              <LoadingButtonContent loading={saving} loadingText="确认中…">
                确认排位
              </LoadingButtonContent>
            </NexusButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeedPool({ candidates }: { candidates: Candidate[] }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'knockout-seed-pool',
    data: { type: 'pool' } satisfies KnockoutSeedDropTarget,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-[var(--radius-nexus)] border p-3 transition-colors',
        isOver ? 'border-nexus-accent/60 bg-nexus-accent/5' : 'border-nexus-line bg-nexus-panel-2',
      ].join(' ')}
      aria-label="候选队伍池"
    >
      <Kicker className="mb-3">候选队伍</Kicker>
      {candidates.length === 0 ? (
        <div className="rounded-[var(--radius-nexus)] border border-dashed border-nexus-line/50 py-8 text-center font-mono text-[11px] text-nexus-faint">
          暂无候选队伍
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((candidate) => (
            <SeedCandidate key={candidate.teamId} candidate={candidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeedCandidate({ candidate }: { candidate: Candidate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pool:${candidate.teamId}`,
    data: { teamId: candidate.teamId, from: 'pool' } satisfies KnockoutSeedDragSource,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-bg px-3 py-2',
        'transition-colors hover:border-nexus-accent/40 cursor-grab active:cursor-grabbing',
        isDragging ? 'opacity-60' : '',
      ].join(' ')}
      {...listeners}
      {...attributes}
    >
      <div className="font-body text-[13px] text-nexus-ink">{candidate.teamName}</div>
      <div className="font-mono text-[10px] text-nexus-faint mt-0.5">
        {candidate.seedLabel} · {candidate.groupName}组第 {candidate.rank}
      </div>
    </div>
  );
}

function SeedSlot({ slot, candidate }: { slot: KnockoutSeedSlotState; candidate: Candidate | null | undefined }) {
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `slot:${slot.matchId}:${slot.slot}`,
    data: { type: 'slot', matchId: slot.matchId, slot: slot.slot } satisfies KnockoutSeedDropTarget,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot-team:${slot.matchId}:${slot.slot}`,
    data: {
      teamId: slot.teamId ?? '',
      from: 'slot',
      matchId: slot.matchId,
      slot: slot.slot,
    } satisfies KnockoutSeedDragSource,
    disabled: slot.teamId === null,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setDroppableRef}
      className={[
        'min-h-20 rounded-[var(--radius-nexus)] border p-3 transition-colors',
        isOver ? 'border-nexus-accent/60 bg-nexus-accent/5' : 'border-nexus-line',
      ].join(' ')}
      aria-label={`${slot.matchId} ${slot.slot} 槽位`}
    >
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-faint">
        {slot.slot} 槽位
      </div>
      {candidate ? (
        <div
          ref={setDraggableRef}
          style={style}
          className={[
            'rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 py-2',
            'cursor-grab active:cursor-grabbing transition-colors hover:border-nexus-accent/40',
            isDragging ? 'opacity-60' : '',
          ].join(' ')}
          {...listeners}
          {...attributes}
        >
          <div className="font-body text-[13px] text-nexus-ink">{candidate.teamName}</div>
          <div className="font-mono text-[10px] text-nexus-faint mt-0.5">{candidate.seedLabel}</div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-nexus)] border border-dashed border-nexus-line/50 py-3 text-center font-mono text-[11px] text-nexus-faint">
          未安排
        </div>
      )}
    </div>
  );
}
