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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  team: TeamPreview & { id: string };
  /** Snapshot version for optimistic-conflict detection; bump invalidates local state. */
  seq: number;
};

type LocalSlot = { position: Position; registration: RegistrationRef | null };

export function DraggableTeamBoard({ team, seq }: Props) {
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
    const toPos = event.over?.id as Position | undefined;
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

  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 shadow p-3 relative">
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
            {team.budgetLeft}
            <span className="text-xs text-muted-foreground ml-0.5 font-normal">CR</span>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-1">
          {slots.map((slot) => (
            <DroppableSlot key={slot.position} slot={slot} disabled={submitting} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function DroppableSlot({ slot, disabled }: { slot: LocalSlot; disabled: boolean }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slot.position });
  return (
    <div
      ref={setDropRef}
      className={cn(
        'grid items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition-colors',
        isOver
          ? 'ring-2 ring-primary bg-accent border-primary'
          : slot.registration
          ? 'border-border bg-muted/30'
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
        {slot.registration ? slot.registration.cost : '—'}
      </span>
    </div>
  );
}

function DraggablePlayer({ slot, disabled }: { slot: LocalSlot; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.position}`,
    data: { position: slot.position },
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
