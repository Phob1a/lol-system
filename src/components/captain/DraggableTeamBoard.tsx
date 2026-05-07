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
import type { TeamPreview, PlayerRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';

type Props = {
  team: TeamPreview & { id: string };
  /** Snapshot version for optimistic-conflict detection; bump invalidates local state. */
  seq: number;
};

type LocalSlot = { position: Position; player: PlayerRef | null };

export function DraggableTeamBoard({ team, seq }: Props) {
  const [slots, setSlots] = useState<LocalSlot[]>(team.slots);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSlots(team.slots);
  }, [team.slots, seq]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function persist(next: LocalSlot[]) {
    setSubmitting(true);
    const res = await fetch(`/api/draft/team/${team.id}/slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slots: next.map((s) => ({ position: s.position, playerId: s.player?.id ?? null })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '调整失败');
      setSlots(team.slots);
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
    const fromPlayer = next[fromIdx].player;
    const toPlayer = next[toIdx].player;
    next[fromIdx] = { ...next[fromIdx], player: toPlayer };
    next[toIdx] = { ...next[toIdx], player: fromPlayer };
    setSlots(next);
    void persist(next);
  }

  const accent = 'var(--tc-cyan)';

  return (
    <div
      className="tc-card"
      style={{
        padding: 12,
        position: 'relative',
        border: `1px solid ${accent}`,
        background: 'rgba(0,229,255,0.06)',
        boxShadow: 'inset 0 0 18px rgba(0,229,255,0.12)',
      }}
    >
      <span className="corner tl" style={{ borderColor: accent }} />
      <span className="corner tr" style={{ borderColor: accent }} />
      <span className="corner bl" style={{ borderColor: accent }} />
      <span className="corner br" style={{ borderColor: accent }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tc-display" style={{ fontSize: 14, color: 'var(--tc-cyan)' }}>
            {team.captainNickname}
            <span className="tc-chip tc-chip-on" style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px' }}>
              MINE · DRAG TO SWAP
            </span>
          </div>
          <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            @{team.captainGameId}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tc-label" style={{ fontSize: 9 }}>BUDGET</div>
          <div className="tc-num" style={{ fontSize: 15, color: 'var(--tc-amber)' }}>
            {team.budgetLeft}
            <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-dim)', marginLeft: 2 }}>CR</span>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
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
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '46px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '6px 8px',
        background: isOver
          ? 'rgba(0,229,255,0.14)'
          : slot.player
          ? 'rgba(255,255,255,0.025)'
          : 'rgba(255,255,255,0.01)',
        border: `1px solid ${isOver ? 'var(--tc-cyan)' : 'var(--tc-line)'}`,
        boxShadow: isOver ? '0 0 12px rgba(0,229,255,0.35)' : 'none',
        transition: 'background .12s, border-color .12s',
        fontSize: 11,
      }}
    >
      <span className="tc-label" style={{ fontSize: 9 }}>
        {POSITION_LABEL[slot.position]}
      </span>
      {slot.player ? (
        <DraggablePlayer slot={slot} disabled={disabled} />
      ) : (
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
      )}
      <span
        className="tc-num"
        style={{ fontSize: 11, color: slot.player ? 'var(--tc-amber)' : 'var(--tc-text-faint)' }}
      >
        {slot.player ? slot.player.cost : '—'}
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
  if (!slot.player) return null;
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
      <span style={{ color: 'var(--tc-text-faint)', fontSize: 10 }}>⋮⋮</span>
      <span
        className="tc-display"
        style={{
          fontSize: 12,
          color: 'var(--tc-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {slot.player.nickname}
      </span>
      <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>
        @{slot.player.gameId}
      </span>
    </span>
  );
}
