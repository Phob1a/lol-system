'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { formatCost } from '@/lib/costs';
import { PosPip, type Position as NexusPosition } from '@/components/nexus/PosPip';

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
    if (disabled) close();
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

  return (
    <div
      className="w-[300px] space-y-2.5 rounded-[var(--radius-nexus)] border border-nexus-line p-3"
      style={{
        background: 'rgb(var(--panel))',
        boxShadow: '0 8px 28px rgb(0 0 0 / 0.5)',
      }}
    >
      {/* Header: captain name + budget */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
            队伍详情
          </p>
          <p className="truncate font-display text-sm font-semibold text-nexus-ink">
            {team.captainNickname}
          </p>
          <p className="font-mono text-[10px] text-nexus-faint truncate">
            @{team.captainGameId}
          </p>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-nexus-faint">
            剩余预算
          </p>
          <p
            className="font-mono tabular-nums text-base font-semibold"
            style={{ color: 'rgb(var(--accent-n))' }}
          >
            {`${formatCost(team.budgetLeft)} CR`}
          </p>
          <p className="font-mono text-[10px] text-nexus-faint">{filledCount}/5 已成型</p>
        </div>
      </div>

      {/* Slot rows */}
      <div className="space-y-1">
        {team.slots.map((slot) => (
          <div
            key={slot.position}
            className="grid items-center gap-2 rounded-[var(--radius-nexus)] border px-2 py-1.5"
            style={{
              gridTemplateColumns: '28px minmax(0,1fr) auto',
              borderColor: slot.player
                ? 'rgb(var(--line))'
                : 'rgb(var(--line) / 0.5)',
              background: slot.player
                ? 'rgb(var(--surface))'
                : 'rgb(var(--panel-2) / 0.5)',
            }}
          >
            {/* PosPip lane glyph */}
            <PosPip pos={slot.position as NexusPosition} on={!!slot.player} size={22} />

            {/* Player name or vacancy */}
            {slot.player ? (
              <span className="min-w-0 truncate font-body text-xs font-medium text-nexus-ink">
                {slot.player.nickname}
                <span className="ml-1.5 font-mono text-[9px] text-nexus-faint">
                  @{slot.player.gameId}
                </span>
              </span>
            ) : (
              <span className="font-body text-xs text-nexus-faint">空缺</span>
            )}

            {/* Cost readout */}
            <span
              className="font-mono tabular-nums text-[11px]"
              style={{
                color: slot.player ? 'rgb(var(--gold))' : 'rgb(var(--faint))',
              }}
            >
              {slot.player ? `${formatCost(slot.player.cost)} CR` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
