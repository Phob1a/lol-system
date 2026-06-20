'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect } from 'react';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import LiveDot from '@/components/nexus/LiveDot';
import NexusButton from '@/components/nexus/NexusButton';

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
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden rounded-[var(--radius-nexus)] border-nexus-line"
        style={{ background: 'rgb(var(--panel))', boxShadow: '0 16px 48px rgb(0 0 0 / 0.65)' }}
      >
        {/* Top accent stripe — reduced-motion-safe pulse for turn states */}
        <div
          className={cn(
            'h-[2px] w-full motion-safe:animate-pulse',
          )}
          style={{
            background: meta.isPrimary ? 'rgb(var(--accent-n))' : 'rgb(var(--gold))',
          }}
        />

        {/* HEADER */}
        <DialogHeader className="space-y-0 px-5 pt-4 pb-3 border-b border-nexus-line">
          <div className="flex justify-between items-center mb-2.5">
            <Chip variant={meta.isPrimary ? 'ac' : 'hot'}>
              {isTurn ? <LiveDot /> : '●'}{' '}
              {isTurn ? 'PRIORITY_ALERT' : 'SYS_NOTICE'}
            </Chip>
            <Kicker>
              evt#{Date.now() % 1000} · ack_required
            </Kicker>
          </div>

          <div className="flex gap-3.5 items-start">
            {/* Hex glyph */}
            <div className="shrink-0 w-14 h-14 relative">
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ overflow: 'visible' }}>
                <polygon
                  points={polyHex(28, 28, 24)}
                  strokeWidth={1.5}
                  style={
                    meta.isPrimary
                      ? { fill: 'rgb(var(--accent-n) / 0.1)', stroke: 'rgb(var(--accent-n))' }
                      : { fill: 'rgb(var(--gold) / 0.1)', stroke: 'rgb(var(--gold))' }
                  }
                />
                <polygon
                  points={polyHex(28, 28, 18)}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  style={
                    meta.isPrimary
                      ? { stroke: 'rgb(var(--accent-n) / 0.4)' }
                      : { stroke: 'rgb(var(--gold) / 0.4)' }
                  }
                />
                {isTurn ? (
                  <g
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ stroke: 'rgb(var(--accent-n))' }}
                  >
                    <line x1="20" y1="28" x2="36" y2="28" />
                    <polyline points="30,22 36,28 30,34" />
                  </g>
                ) : (
                  <g
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    style={{ stroke: 'rgb(var(--gold))' }}
                  >
                    <path d="M 20 32 A 10 10 0 1 0 36 32" />
                    <line x1="28" y1="18" x2="28" y2="30" />
                  </g>
                )}
              </svg>
              {isTurn && (
                <div
                  className="absolute -inset-0.5 border rounded-[var(--radius-nexus)] motion-safe:animate-pulse pointer-events-none"
                  style={{ borderColor: 'rgb(var(--accent-n) / 0.6)' }}
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-sm font-bold leading-tight tracking-wide text-nexus-ink">
                {meta.title}
              </DialogTitle>
              <Readout
                className="block text-[10px] mt-1 tracking-wide"
                style={{ color: meta.isPrimary ? 'rgb(var(--accent-n))' : 'rgb(var(--gold))' }}
              >
                {meta.subtitle}
              </Readout>
            </div>
          </div>
        </DialogHeader>

        {/* BODY */}
        <div className="px-5 py-4 space-y-3">
          {isStarted && (
            <div
              className={cn(
                'px-3 py-2.5 border-l-[3px] rounded-[var(--radius-nexus)]',
                isTurn && 'mb-3',
              )}
              style={{
                borderLeftColor: 'rgb(var(--gold))',
                background: 'rgb(var(--gold) / 0.06)',
              }}
            >
              <Kicker
                as="div"
                className="mb-1"
                style={{ color: 'rgb(var(--gold))' }}
              >
                ▸ SESSION_STARTED
              </Kicker>
              <div className="text-xs text-nexus-dim font-mono leading-relaxed">
                管理员已开启选秀。名册和配置已锁定。
                <br />
                <span className="text-nexus-faint">
                  config_lock=true · roster_lock=true
                </span>
              </div>
            </div>
          )}

          {isTurn && (
            <div
              className="px-3 py-2.5 border-l-[3px] rounded-[var(--radius-nexus)]"
              style={{
                borderLeftColor: 'rgb(var(--accent-n))',
                background: 'rgb(var(--accent-n) / 0.06)',
              }}
            >
              <Kicker as="div" className="mb-1 text-nexus-accent">
                ▸ ACTION_REQUIRED
              </Kicker>
              <div className="text-xs text-nexus-dim font-mono leading-relaxed">
                请从右侧候选池选择一名选手并指定其位置。
                {currentRound != null && (
                  <>
                    {' '}
                    当前为
                    <Readout
                      className="text-nexus-accent text-xs ml-0.5"
                    >
                      round_{String(currentRound).padStart(2, '0')}
                    </Readout>
                    。
                  </>
                )}
              </div>

              {(budgetLeft != null || emptySlots != null) && (
                <div className="flex gap-2.5 mt-2.5">
                  {budgetLeft != null && (
                    <div
                      className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-nexus)] border border-nexus-line"
                      style={{ background: 'rgb(var(--panel-2))' }}
                    >
                      <Kicker as="div" className="mb-0.5">
                        REMAINING
                      </Kicker>
                      <Readout
                        className="text-lg font-bold tabular-nums mt-0.5"
                        style={{ color: 'rgb(var(--good))' }}
                      >
                        {formatCost(budgetLeft)}
                        <span className="text-xs text-nexus-faint ml-0.5 font-normal">CR</span>
                      </Readout>
                    </div>
                  )}
                  {emptySlots != null && (
                    <div
                      className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-nexus)] border border-nexus-line"
                      style={{ background: 'rgb(var(--panel-2))' }}
                    >
                      <Kicker as="div" className="mb-0.5">
                        EMPTY SLOTS
                      </Kicker>
                      <Readout
                        className="text-lg font-bold tabular-nums mt-0.5"
                        style={{ color: 'rgb(var(--gold))' }}
                      >
                        {emptySlots}
                        <span className="text-xs text-nexus-faint ml-0.5 font-normal">/ 5</span>
                      </Readout>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <DialogFooter
          className="grid grid-cols-[1fr_auto] items-center gap-3.5 px-5 py-3 border-t border-nexus-line"
          style={{ background: 'rgb(var(--panel-2))' }}
        >
          <span className="text-[10px] text-nexus-faint font-mono inline-flex items-center gap-1.5">
            <LiveDot />
            sse_connected · press ENTER to ack
          </span>
          <NexusButton
            variant="primary"
            onClick={onConfirm}
            className="min-w-[140px]"
          >
            ▸ ACK · 我知道了
          </NexusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
