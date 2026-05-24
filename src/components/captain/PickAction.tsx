'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
}: Props) {
  const [position, setPosition] = useState<Position | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const insufficientBudget = budgetLeft < player.cost;
  const noSlots = emptySlots.length === 0;

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
              PICK <span className="text-muted-foreground">//</span> {player.nickname}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              @{player.gameId} · cost {player.cost} CR · budget {budgetLeft} CR
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
            ⚠ 预算不足：还差 {player.cost - budgetLeft} CR
          </div>
        )}
        {noSlots && (
          <div className="px-3 py-2 mb-3 border-l-[3px] border-l-destructive bg-destructive/10 rounded-sm text-xs text-destructive font-mono">
            ⚠ 该战队已无空位
          </div>
        )}

        <div className="mb-4">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            ASSIGN POSITION（不校验熟练位）
          </span>
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {POSITIONS.map((pos) => {
              const empty = emptySlots.includes(pos);
              const active = position === pos;
              const letter = POS_LETTER[pos] ?? pos[0];
              return (
                <button
                  key={pos}
                  type="button"
                  disabled={!empty || insufficientBudget}
                  onClick={() => setPosition(pos)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-md border text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                    !empty && 'opacity-35 cursor-not-allowed',
                    empty && !insufficientBudget && 'cursor-pointer',
                  )}
                >
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
                </button>
              );
            })}
          </div>
        </div>

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
            {submitting ? '▸ SUBMITTING…' : '▸ CONFIRM PICK'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
