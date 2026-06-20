'use client';

import { type CSSProperties, type KeyboardEvent, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { debitCost, formatCost, normalizeCost } from '@/lib/costs';
import { cn } from '@/lib/utils';
import NexusButton from '@/components/nexus/NexusButton';
import Chip from '@/components/nexus/Chip';
import { PosPip } from '@/components/nexus/PosPip';

/** Normalize stored position key → canonical PosPip code. */
const POS_NORMALIZE: Record<string, Position> = {
  TOP: 'TOP',
  JG: 'JUNGLE',
  JUNGLE: 'JUNGLE',
  MID: 'MID',
  ADC: 'ADC',
  SUP: 'SUPPORT',
  SUPPORT: 'SUPPORT',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: () => void;
  player: RegistrationRef;
  emptySlots: Position[];
  budgetLeft: number;
  expectedSeq: number;
  onBehalfOf?: string;
  initialPosition?: Position;
};

export function PickAction({
  open,
  onOpenChange,
  onPicked,
  player,
  emptySlots,
  budgetLeft,
  expectedSeq,
  onBehalfOf,
  initialPosition,
}: Props) {
  const [position, setPosition] = useState<Position | ''>(initialPosition ?? '');
  const [submitting, setSubmitting] = useState(false);
  const positionGroupId = useId();

  const insufficientBudget = normalizeCost(budgetLeft) < normalizeCost(player.cost);
  const noSlots = emptySlots.length === 0;
  const availablePositions = POSITIONS.filter(
    (pos): pos is Position => emptySlots.includes(pos) && !insufficientBudget,
  );

  useEffect(() => {
    if (!open) return;
    setPosition(initialPosition && emptySlots.includes(initialPosition) ? initialPosition : '');
  }, [emptySlots, initialPosition, open]);

  function handlePositionKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0;
    if (!direction || availablePositions.length === 0) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== `${positionGroupId}-position`) {
      return;
    }

    event.preventDefault();
    const focusedPosition = target.value as Position;
    const focusedIndex = availablePositions.indexOf(focusedPosition);
    const selectedIndex = position ? availablePositions.indexOf(position) : -1;
    const baseIndex = focusedIndex >= 0 ? focusedIndex : Math.max(selectedIndex, 0);
    const nextIndex = (baseIndex + direction + availablePositions.length) % availablePositions.length;
    const nextPosition = availablePositions[nextIndex];

    setPosition(nextPosition);
    document.getElementById(`${positionGroupId}-${nextPosition}`)?.focus();
  }

  async function submit() {
    if (!position) {
      toast.error('请选择位置');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/draft/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        registrationId: player.id,
        position,
        expectedSeq,
        ...(onBehalfOf && { onBehalfOf }),
      }),
    });
    setSubmitting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '出手失败');
      if (body.code === 'STALE_SEQ') onOpenChange(false);
      return;
    }
    toast.success(`已选 ${player.nickname}`);
    onPicked();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg border-nexus-line rounded-[var(--radius-nexus)]"
        style={{ background: 'rgb(var(--panel))' }}
      >
        <DialogTitle className="sr-only">出手确认 — {player.nickname}</DialogTitle>
        <DialogDescription className="sr-only">
          为 {player.nickname} 选择位置并确认出手；按 Esc 或点击右上角关闭。
        </DialogDescription>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 mb-4">
          <div
            className="w-[3px] h-7 shrink-0 rounded-[var(--radius-nexus)]"
            style={{ background: 'rgb(var(--accent-n))' }}
          />
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold tracking-wide text-nexus-ink">
              PICK{' '}
              <span className="text-nexus-dim">{'//'}</span>{' '}
              {player.nickname}
            </div>
            <div className="font-mono text-[10px] text-nexus-faint mt-0.5 tabular-nums">
              @{player.gameId}&nbsp;·&nbsp;cost&nbsp;
              <span style={{ color: 'rgb(var(--accent-n))' }}>{formatCost(player.cost)}</span>
              &nbsp;CR&nbsp;·&nbsp;budget&nbsp;
              <span style={{ color: 'rgb(var(--accent-n))' }}>{formatCost(budgetLeft)}</span>
              &nbsp;CR
            </div>
          </div>
        </header>

        {/* ── Position chips (player's registered positions) ──────────────── */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {player.primaryPositions.map((p) => {
            const normalized = POS_NORMALIZE[p];
            return (
              <Chip key={`p-${p}`} variant="ac">
                {normalized ? <PosPip pos={normalized} on size={14} /> : null}
                {POSITION_LABEL[p as Position] ?? p}
              </Chip>
            );
          })}
          {player.secondaryPositions.map((p) => {
            const normalized = POS_NORMALIZE[p];
            return (
              <Chip key={`s-${p}`} variant="default">
                {normalized ? <PosPip pos={normalized} size={14} /> : null}
                {POSITION_LABEL[p as Position] ?? p}
              </Chip>
            );
          })}
        </div>

        {/* ── Budget / slot warnings ───────────────────────────────────────── */}
        {insufficientBudget && (
          <div
            className="px-3 py-2 mb-3 border-l-[3px] rounded-[var(--radius-nexus)] font-mono text-[11px] tabular-nums"
            style={{
              borderLeftColor: 'rgb(var(--bad))',
              background: 'rgb(var(--bad) / 0.1)',
              color: 'rgb(var(--bad))',
            }}
          >
            ⚠ 预算不足：还差 {formatCost(debitCost(player.cost, budgetLeft))} CR
          </div>
        )}
        {noSlots && (
          <div
            className="px-3 py-2 mb-3 border-l-[3px] rounded-[var(--radius-nexus)] font-mono text-[11px]"
            style={{
              borderLeftColor: 'rgb(var(--bad))',
              background: 'rgb(var(--bad) / 0.1)',
              color: 'rgb(var(--bad))',
            }}
          >
            ⚠ 该战队已无空位
          </div>
        )}

        {/* ── Position selector ───────────────────────────────────────────── */}
        <fieldset
          role="radiogroup"
          aria-labelledby={`${positionGroupId}-legend`}
          className="mb-4"
          onKeyDown={handlePositionKeyDown}
        >
          <legend
            id={`${positionGroupId}-legend`}
            className="font-mono text-[10px] font-semibold tracking-widest uppercase text-nexus-faint"
          >
            ASSIGN POSITION（不校验熟练位）
          </legend>
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {POSITIONS.map((pos) => {
              const empty = emptySlots.includes(pos);
              const active = position === pos;
              const disabled = !empty || insufficientBudget;
              return (
                <label
                  key={pos}
                  htmlFor={`${positionGroupId}-${pos}`}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 px-1.5 border transition-colors',
                    'rounded-[var(--radius-nexus)]',
                    'focus-within:ring-2 focus-within:ring-offset-1',
                    active
                      ? 'border-nexus-accent/70 bg-nexus-accent/10 text-nexus-accent'
                      : 'border-nexus-line bg-nexus-surface text-nexus-dim hover:border-nexus-accent/40 hover:text-nexus-ink',
                    !empty && 'opacity-35 cursor-not-allowed pointer-events-none',
                    empty && !insufficientBudget && 'cursor-pointer',
                  )}
                  style={
                    active
                      ? ({ '--tw-ring-color': 'rgb(var(--accent-n) / 0.5)' } as CSSProperties)
                      : undefined
                  }
                >
                  <input
                    id={`${positionGroupId}-${pos}`}
                    type="radio"
                    name={`${positionGroupId}-position`}
                    value={pos}
                    checked={active}
                    disabled={disabled}
                    onChange={() => setPosition(pos)}
                    className="sr-only"
                  />
                  <PosPip pos={POS_NORMALIZE[pos] ?? (pos as Position)} on={active} size={22} />
                  <span className="font-mono text-[9px] tracking-wide">
                    {POSITION_LABEL[pos]}
                  </span>
                  {!empty && (
                    <span className="font-mono text-[9px] text-nexus-faint">OCCUPIED</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div className="border-t border-nexus-line" />

        {/* ── Footer actions ──────────────────────────────────────────────── */}
        <footer className="flex justify-end gap-2 mt-4">
          <NexusButton type="button" onClick={() => onOpenChange(false)}>
            CANCEL
          </NexusButton>
          <NexusButton
            type="button"
            variant="primary"
            onClick={submit}
            disabled={submitting || !position || insufficientBudget || noSlots}
            className="min-w-[160px]"
          >
            <LoadingButtonContent loading={submitting} loadingText="CONFIRMING...">
              CONFIRM PICK
            </LoadingButtonContent>
          </NexusButton>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
