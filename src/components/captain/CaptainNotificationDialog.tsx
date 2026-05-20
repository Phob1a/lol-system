'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export type CaptainNoticeKind = 'started' | 'turn' | 'started-and-turn';

type Props = {
  kind: CaptainNoticeKind;
  /** Round number to mention; relevant for 'turn' / 'started-and-turn'. */
  currentRound?: number;
  /** Captain's remaining budget; shown for 'turn' / 'started-and-turn'. */
  budgetLeft?: number;
  emptySlots?: number;
  onConfirm: () => void;
};

/* ─── helpers ─── */
function polyHex(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return pts.join(' ');
}

export function CaptainNotificationDialog({
  kind,
  currentRound,
  budgetLeft,
  emptySlots,
  onConfirm,
}: Props) {
  const isTurn = kind === 'turn' || kind === 'started-and-turn';
  const isStarted = kind === 'started' || kind === 'started-and-turn';

  // Dictate by kind
  const meta =
    kind === 'started-and-turn'
      ? {
          title: 'DRAFT INITIATED · YOU ARE ON CLOCK',
          subtitle: '▸ session_started + on_clock_signal',
          isPrimary: true,
        }
      : kind === 'turn'
      ? {
          title: 'YOU ARE ON CLOCK',
          subtitle: '▸ on_clock_signal :: pick required',
          isPrimary: true,
        }
      : {
          title: 'DRAFT INITIATED',
          subtitle: '▸ session_started :: roster locked',
          isPrimary: false,
        };

  // ENTER to ack
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm]);

  return (
    <Dialog open onOpenChange={(o) => !o && onConfirm()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-xl">
        {/* Top accent stripe — pulses for turn states */}
        <div
          className={cn(
            'h-1 w-full',
            meta.isPrimary ? 'bg-primary' : 'bg-amber-500',
            isTurn && 'animate-pulse',
          )}
        />

        {/* HEADER */}
        <DialogHeader className="space-y-0 px-5 pt-4 pb-3 border-b">
          <div className="flex justify-between items-center mb-2.5">
            <Badge
              variant={meta.isPrimary ? 'default' : 'secondary'}
              className={cn('text-xs', isTurn && 'animate-pulse')}
            >
              ● {isTurn ? 'PRIORITY_ALERT' : 'SYS_NOTICE'}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">
              evt#{Date.now() % 1000} · ack_required
            </span>
          </div>

          <div className="flex gap-3.5 items-start">
            {/* Hex glyph */}
            <div className="shrink-0 w-14 h-14 relative">
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ overflow: 'visible' }}>
                <polygon
                  points={polyHex(28, 28, 24)}
                  className={meta.isPrimary ? 'fill-primary/10 stroke-primary' : 'fill-amber-500/10 stroke-amber-500'}
                  strokeWidth={1.5}
                />
                <polygon
                  points={polyHex(28, 28, 18)}
                  fill="none"
                  className={meta.isPrimary ? 'stroke-primary/40' : 'stroke-amber-500/40'}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {isTurn ? (
                  <g
                    className="stroke-primary"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="20" y1="28" x2="36" y2="28" />
                    <polyline points="30,22 36,28 30,34" />
                  </g>
                ) : (
                  <g
                    className="stroke-amber-500"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  >
                    <path d="M 20 32 A 10 10 0 1 0 36 32" />
                    <line x1="28" y1="18" x2="28" y2="30" />
                  </g>
                )}
              </svg>
              {isTurn && (
                <div
                  className="absolute -inset-0.5 border border-primary rounded-sm animate-pulse pointer-events-none"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold leading-tight tracking-wide text-foreground">
                {meta.title}
              </DialogTitle>
              <div
                className={cn(
                  'text-[10px] font-mono mt-1 tracking-wide',
                  meta.isPrimary ? 'text-primary' : 'text-amber-600',
                )}
              >
                {meta.subtitle}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* BODY */}
        <div className="px-5 py-4 space-y-3">
          {isStarted && (
            <div
              className={cn(
                'px-3 py-2.5 border-l-[3px] rounded-sm',
                'border-l-amber-500 bg-amber-500/5',
                isTurn && 'mb-3',
              )}
            >
              <div className="text-[10px] font-semibold tracking-widest uppercase text-amber-600 mb-1">
                ▸ SESSION_STARTED
              </div>
              <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                管理员已开启选秀。名册和配置已锁定。
                <br />
                <span className="text-muted-foreground/60">
                  config_lock=true · roster_lock=true
                </span>
              </div>
            </div>
          )}

          {isTurn && (
            <div className="px-3 py-2.5 border-l-[3px] border-l-primary bg-primary/5 rounded-sm">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-primary mb-1">
                ▸ ACTION_REQUIRED
              </div>
              <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                请从右侧候选池选择一名选手并指定其位置。
                {currentRound != null && (
                  <>
                    {' '}
                    当前为
                    <span className="text-primary">
                      {' '}
                      round_{String(currentRound).padStart(2, '0')}
                    </span>
                    。
                  </>
                )}
              </div>

              {(budgetLeft != null || emptySlots != null) && (
                <div className="flex gap-2.5 mt-2.5">
                  {budgetLeft != null && (
                    <div className="flex-1 px-2.5 py-1.5 rounded-md border bg-muted/30">
                      <div className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground">
                        REMAINING
                      </div>
                      <div className="text-lg font-bold text-green-600 tabular-nums mt-0.5">
                        {budgetLeft}
                        <span className="text-xs text-muted-foreground ml-0.5 font-normal">CR</span>
                      </div>
                    </div>
                  )}
                  {emptySlots != null && (
                    <div className="flex-1 px-2.5 py-1.5 rounded-md border bg-muted/30">
                      <div className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground">
                        EMPTY SLOTS
                      </div>
                      <div className="text-lg font-bold text-amber-600 tabular-nums mt-0.5">
                        {emptySlots}
                        <span className="text-xs text-muted-foreground ml-0.5 font-normal">/ 5</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <DialogFooter className="grid grid-cols-[1fr_auto] items-center gap-3.5 px-5 py-3 border-t">
          <span className="text-[10px] text-muted-foreground font-mono">
            <span className="text-green-500">●</span> sse_connected · press ENTER to ack
          </span>
          <Button
            onClick={onConfirm}
            variant="default"
            className="min-w-[140px]"
          >
            ▸ ACK · 我知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
