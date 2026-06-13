'use client';

import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { debitCost, formatCost, normalizeCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

/** Short letter label for a position — rendered inline, no tactical import needed. */
const POS_LETTER: Record<string, string> = {
  TOP: 'T',
  JG: 'J',
  JUNGLE: 'J',
  MID: 'M',
  ADC: 'A',
  SUP: 'S',
  SUPPORT: 'S',
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
      <DialogContent className="max-w-lg bg-card rounded-xl">
        <DialogTitle className="sr-only">出手确认 — {player.nickname}</DialogTitle>
        <DialogDescription className="sr-only">
          为 {player.nickname} 选择位置并确认出手；按 Esc 或点击右上角关闭。
        </DialogDescription>
        <header className="flex items-center gap-3 mb-4">
          <div className="w-1 h-7 rounded-sm bg-primary shrink-0" />
          <div>
            <div className="text-base font-bold tracking-wide text-foreground">
              PICK <span className="text-muted-foreground">{'//'}</span> {player.nickname}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              @{player.gameId} · cost {formatCost(player.cost)} CR · budget {formatCost(budgetLeft)} CR
            </div>
          </div>
        </header>

        <div className="flex gap-1.5 flex-wrap mb-4">
          {player.primaryPositions.map((p) => (
            <Badge key={`p-${p}`} variant="default" className="text-xs gap-1">
              ◆ {p} <span className="opacity-70">{POSITION_LABEL[p]}</span>
            </Badge>
          ))}
          {player.secondaryPositions.map((p) => (
            <Badge key={`s-${p}`} variant="outline" className="text-xs gap-1">
              ○ {p} <span className="opacity-70">{POSITION_LABEL[p]}</span>
            </Badge>
          ))}
        </div>

        {insufficientBudget && (
          <div className="px-3 py-2 mb-3 border-l-[3px] border-l-destructive bg-destructive/10 rounded-sm text-xs text-destructive font-mono">
            ⚠ 预算不足：还差 {formatCost(debitCost(player.cost, budgetLeft))} CR
          </div>
        )}
        {noSlots && (
          <div className="px-3 py-2 mb-3 border-l-[3px] border-l-destructive bg-destructive/10 rounded-sm text-xs text-destructive font-mono">
            ⚠ 该战队已无空位
          </div>
        )}

        <fieldset
          role="radiogroup"
          aria-labelledby={`${positionGroupId}-legend`}
          className="mb-4"
          onKeyDown={handlePositionKeyDown}
        >
          <legend
            id={`${positionGroupId}-legend`}
            className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground"
          >
            ASSIGN POSITION（不校验熟练位）
          </legend>
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {POSITIONS.map((pos) => {
              const empty = emptySlots.includes(pos);
              const active = position === pos;
              const letter = POS_LETTER[pos] ?? pos[0];
              const disabled = !empty || insufficientBudget;
              return (
                <label
                  key={pos}
                  htmlFor={`${positionGroupId}-${pos}`}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-md border text-xs transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                    !empty && 'opacity-35 cursor-not-allowed',
                    empty && !insufficientBudget && 'cursor-pointer',
                  )}
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
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-5 h-5 rounded-sm border text-[10px] font-bold',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : empty
                        ? 'border-border text-foreground'
                        : 'border-muted-foreground/30 text-muted-foreground/40',
                    )}
                  >
                    {letter}
                  </span>
                  <span className="tracking-wide">{POSITION_LABEL[pos]}</span>
                  {!empty && (
                    <span className="text-[9px] text-muted-foreground font-mono">OCCUPIED</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="border-t" />

        <footer className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            CANCEL
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={submit}
            disabled={submitting || !position || insufficientBudget || noSlots}
            className="min-w-[160px]"
          >
            <LoadingButtonContent loading={submitting} loadingText="CONFIRMING...">
              CONFIRM PICK
            </LoadingButtonContent>
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
