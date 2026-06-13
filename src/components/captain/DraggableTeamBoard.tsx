'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { TeamPreview, RegistrationRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { TeamHoverCard, type TeamHoverSummary } from '@/components/draft/TeamHoverCard';
import { Badge } from '@/components/ui/badge';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

type Props = {
  team: TeamPreview & { id: string };
  /** Snapshot version for optimistic-conflict detection; bump invalidates local state. */
  seq: number;
  /** Enables pool-player drop affordance on empty own-team slots. */
  pickDropEnabled?: boolean;
  /** Use an ancestor DndContext when the pool and board need to share one drag surface. */
  dndMode?: 'internal' | 'external';
};

type LocalSlot = { position: Position; registration: RegistrationRef | null };

export function DraggableTeamBoard({
  team,
  seq,
  pickDropEnabled = false,
  dndMode = 'internal',
}: Props) {
  const [slots, setSlots] = useState<LocalSlot[]>(
    team.slots.map((s) => ({ position: s.position, registration: s.player })),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSlots(team.slots.map((s) => ({ position: s.position, registration: s.player })));
  }, [team.slots, seq]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function persist(next: LocalSlot[]) {
    setSubmitting(true);
    const res = await fetch(`/api/draft/team/${team.id}/slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slots: next.map((s) => ({ position: s.position, registrationId: s.registration?.id ?? null })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '调整失败');
      setSlots(team.slots.map((s) => ({ position: s.position, registration: s.player })));
      return;
    }
    toast.success('已调整位置');
  }

  function onDragEnd(event: DragEndEvent) {
    const fromPos = event.active.data.current?.position as Position | undefined;
    const toPos = event.over?.data.current?.position as Position | undefined;
    if (!fromPos || !toPos || fromPos === toPos) return;

    const fromIdx = slots.findIndex((s) => s.position === fromPos);
    const toIdx = slots.findIndex((s) => s.position === toPos);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = slots.slice();
    const fromRegistration = next[fromIdx].registration;
    const toRegistration = next[toIdx].registration;
    next[fromIdx] = { ...next[fromIdx], registration: toRegistration };
    next[toIdx] = { ...next[toIdx], registration: fromRegistration };
    setSlots(next);
    void persist(next);
  }

  const hoverTeam: TeamHoverSummary = {
    captainNickname: team.captainNickname,
    captainGameId: team.captainGameId,
    budgetLeft: team.budgetLeft,
    slots: slots.map((slot) => ({
      position: slot.position,
      player: slot.registration,
    })),
  };

  const board = (
    <div className="rounded-xl border-2 border-primary bg-primary/5 shadow p-3 relative">
      <TeamHoverCard team={hoverTeam} disabled={submitting}>
        <div className="flex justify-between items-baseline gap-2 mb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary truncate">
              {team.captainNickname}
              <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                MINE · DRAG TO SWAP
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground font-mono">@{team.captainGameId}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground">BUDGET</div>
            <div className="text-base font-bold text-amber-600 tabular-nums">
              {formatCost(team.budgetLeft)}
              <span className="text-xs text-muted-foreground ml-0.5 font-normal">CR</span>
            </div>
          </div>
        </div>
      </TeamHoverCard>

      <div className="flex flex-col gap-1">
        {slots.map((slot) => (
          <DroppableSlot
            key={slot.position}
            slot={slot}
            disabled={submitting}
            pickDropEnabled={pickDropEnabled}
          />
        ))}
      </div>
    </div>
  );

  if (dndMode === 'external') return board;
  return <DndContext sensors={sensors} onDragEnd={onDragEnd}>{board}</DndContext>;
}

function DroppableSlot({
  slot,
  disabled,
  pickDropEnabled,
}: {
  slot: LocalSlot;
  disabled: boolean;
  pickDropEnabled: boolean;
}) {
  const canDropPick = pickDropEnabled && slot.registration === null && !disabled;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `team-slot-${slot.position}`,
    data: { position: slot.position, acceptsPick: canDropPick },
  });
  return (
    <div
      ref={setDropRef}
      data-testid={`team-slot-drop-${slot.position}`}
      data-pick-drop-enabled={String(canDropPick)}
      className={cn(
        'grid items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition-colors',
        isOver
          ? 'ring-2 ring-primary bg-accent border-primary'
          : slot.registration
          ? 'border-border bg-muted/30'
          : canDropPick
          ? 'border-dashed border-primary/60 bg-primary/5'
          : 'border-border bg-muted/10',
      )}
      style={{ gridTemplateColumns: '46px 1fr auto' }}
    >
      <span className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground">
        {POSITION_LABEL[slot.position]}
      </span>
      {slot.registration ? (
        <PlayerHoverCard player={slot.registration} disabled={disabled}>
          <DraggablePlayer slot={slot} disabled={disabled} />
        </PlayerHoverCard>
      ) : (
        <span className="text-xs text-muted-foreground font-mono">— empty —</span>
      )}
      <span
        className={cn(
          'tabular-nums text-xs font-medium',
          slot.registration ? 'text-amber-600' : 'text-muted-foreground',
        )}
      >
        {slot.registration ? formatCost(slot.registration.cost) : '—'}
      </span>
    </div>
  );
}

function DraggablePlayer({ slot, disabled }: { slot: LocalSlot; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.position}`,
    data: { type: 'slot-player', position: slot.position },
    disabled,
  });
  if (!slot.registration) return null;
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        minWidth: 0,
      }}
    >
      <span className="text-muted-foreground text-[10px]">⋮⋮</span>
      <span className="text-xs font-medium text-foreground truncate">
        {slot.registration.nickname}
      </span>
      <span className="text-[9px] text-muted-foreground font-mono shrink-0">
        @{slot.registration.gameId}
      </span>
    </span>
  );
}
