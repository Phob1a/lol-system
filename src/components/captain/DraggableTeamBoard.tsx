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
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { TeamHoverCard, type TeamHoverSummary } from '@/components/draft/TeamHoverCard';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';
import Panel from '@/components/nexus/Panel';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import { PosPip } from '@/components/nexus/PosPip';

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
    <Panel className="p-3">
      <TeamHoverCard team={hoverTeam} disabled={submitting}>
        {/* Header row — wrapping div kept so tests can do .closest('div') on the badge text */}
        <div className="flex justify-between items-center gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="font-display font-semibold text-[14px] leading-tight truncate"
                style={{ color: 'rgb(var(--ink))' }}
              >
                {team.captainNickname}
              </span>
              <Chip variant="ac">MINE · DRAG TO SWAP</Chip>
            </div>
            <Kicker>@{team.captainGameId}</Kicker>
          </div>

          {/* Budget readout */}
          <div className="shrink-0 text-right">
            <Kicker className="mb-0.5">BUDGET</Kicker>
            <div
              className="font-mono tabular-nums text-[15px] font-semibold leading-none"
              style={{ color: 'rgb(var(--accent-n))' }}
            >
              {formatCost(team.budgetLeft)}
              <span
                className="font-mono text-[10px] ml-0.5"
                style={{ color: 'rgb(var(--faint))' }}
              >
                CR
              </span>
            </div>
          </div>
        </div>
      </TeamHoverCard>

      {/* Slot rows */}
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
    </Panel>
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
        'grid items-center gap-2 px-2 py-[7px] rounded-[var(--radius-nexus)] border text-xs transition-colors',
        isOver
          ? 'border-nexus-accent ring-1 ring-nexus-accent/40 bg-nexus-panel-2'
          : slot.registration
          ? 'border-nexus-line bg-nexus-panel'
          : canDropPick
          ? 'border-dashed border-nexus-accent/50 bg-nexus-panel'
          : 'border-nexus-line bg-nexus-panel',
      )}
      style={{ gridTemplateColumns: '26px 1fr auto' }}
    >
      {/* Position pip */}
      <PosPip
        pos={slot.position as 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'}
        on={!!slot.registration}
        size={22}
      />

      {slot.registration ? (
        <PlayerHoverCard player={slot.registration} disabled={disabled}>
          <DraggablePlayer slot={slot} disabled={disabled} />
        </PlayerHoverCard>
      ) : (
        <span className="font-mono text-[10px] text-nexus-faint">— 空缺 —</span>
      )}

      {/* Cost */}
      <span
        className="tabular-nums font-mono text-[11px]"
        style={{
          color: slot.registration ? 'rgb(var(--accent-n))' : 'rgb(var(--faint))',
        }}
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
        gap: 5,
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        minWidth: 0,
      }}
    >
      <span style={{ color: 'rgb(var(--faint))', fontSize: 10 }}>⋮⋮</span>
      <span
        className="font-display text-[12.5px] truncate"
        style={{ color: 'rgb(var(--ink))' }}
      >
        {slot.registration.nickname}
      </span>
      <span
        className="font-mono text-[10px] shrink-0"
        style={{ color: 'rgb(var(--faint))' }}
      >
        @{slot.registration.gameId}
      </span>
    </span>
  );
}
