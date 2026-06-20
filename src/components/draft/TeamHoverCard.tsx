'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { POSITION_LABEL } from '@/components/players/positions';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

const OPEN_DELAY_MS = 150;
const GAP = 8;
const FALLBACK_CARD_WIDTH = 300;
const Z_INDEX = 70;

export type TeamHoverSummary = {
  captainNickname: string;
  captainGameId: string;
  budgetLeft: number;
  slots: {
    position: Position;
    player: RegistrationRef | null;
  }[];
};

type Coords = { top: number; left: number };

function computeCoords(rect: DOMRect, cardWidth: number, cardHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.right + GAP;
  if (left + cardWidth > vw - GAP) {
    left = rect.left - cardWidth - GAP;
  }
  if (left < GAP) left = GAP;

  let top = rect.top;
  if (cardHeight > 0 && top + cardHeight > vh - GAP) {
    top = vh - cardHeight - GAP;
  }
  if (top < GAP) top = GAP;
  return { top, left };
}

type Props = {
  team: TeamHoverSummary;
  disabled?: boolean;
  children: React.ReactNode;
};

export function TeamHoverCard({ team, disabled, children }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function close() {
    clearTimer();
    setOpen(false);
  }

  function handleMouseEnter() {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      const wrapper = triggerRef.current;
      const target = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      setCoords(computeCoords(rect, FALLBACK_CARD_WIDTH, 0));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }

  useEffect(() => {
    if (!disabled) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const wrapper = triggerRef.current;
    const target = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
    const card = cardRef.current;
    if (!target || !card) return;
    const rect = target.getBoundingClientRect();
    const next = computeCoords(rect, card.offsetWidth, card.offsetHeight);
    setCoords((cur) =>
      cur && cur.top === next.top && cur.left === next.left ? cur : next,
    );
  }, [open]);

  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={close}
        onPointerDown={close}
        style={{ display: 'contents' }}
      >
        {children}
      </span>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={cardRef}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: Z_INDEX,
                pointerEvents: 'none',
              }}
            >
              <TeamInfoCard team={team} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TeamInfoCard({ team }: { team: TeamHoverSummary }) {
  const filledCount = team.slots.filter((slot) => slot.player !== null).length;
  const budgetTotal = team.budgetLeft + team.slots.reduce((sum, slot) => sum + (slot.player?.cost ?? 0), 0);
  const budgetPct = budgetTotal > 0 ? Math.max(0, Math.min(100, (team.budgetLeft / budgetTotal) * 100)) : 0;

  return (
    <div className="arena-panel arena-corner w-[320px] overflow-hidden p-3 text-slate-100">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            队伍详情
          </p>
          <p className="mt-1 truncate text-sm font-bold text-white">
            {team.captainNickname}
          </p>
          <p className="text-xs text-slate-400">@{team.captainGameId}</p>
        </div>
        <div className="shrink-0 rounded border border-cyan-200/20 bg-cyan-200/10 px-2 py-1 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-cyan-100/70">
            剩余预算
          </p>
          <p className="text-base font-black leading-tight text-white">
            {formatCost(team.budgetLeft)} CR
          </p>
          <p className="text-[10px] text-cyan-100/70">{filledCount}/5 已成型</p>
        </div>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(94,231,255,0.55)]"
          style={{ width: `${budgetPct}%` }}
        />
      </div>

      <div className="space-y-1">
        {team.slots.map((slot) => (
          <div
            key={slot.position}
            className={cn(
              'grid items-center gap-2 rounded border px-2 py-1.5 text-xs',
              slot.player
                ? 'border-cyan-200/20 bg-cyan-200/[0.08]'
                : 'border-white/10 bg-white/[0.03]',
            )}
            style={{ gridTemplateColumns: '42px minmax(0,1fr) auto' }}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200/65">
              {POSITION_LABEL[slot.position]}
            </span>
            {slot.player ? (
              <span className="min-w-0 truncate font-medium text-white">
                {slot.player.nickname}
                <span className="ml-1.5 text-[9px] font-normal text-slate-400">
                  @{slot.player.gameId}
                </span>
              </span>
            ) : (
              <span className="text-slate-500">空缺</span>
            )}
            <span
              className={cn(
                'tabular-nums',
                slot.player ? 'font-bold text-amber-100' : 'text-slate-500',
              )}
            >
              {slot.player ? `${formatCost(slot.player.cost)} CR` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
