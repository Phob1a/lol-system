'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerRef } from '@/lib/teams/preview';
import { PlayerInfoCard } from '@/components/draft/PlayerInfoCard';

const OPEN_DELAY_MS = 150;
const GAP = 8;
const FALLBACK_CARD_WIDTH = 280;
const Z_INDEX = 70;

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
  player: PlayerRef;
  /** When true, suppresses hover entirely and force-closes any open card. */
  disabled?: boolean;
  children: React.ReactNode;
};

export function PlayerHoverCard({ player, disabled, children }: Props) {
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
    const el = triggerRef.current;
    if (!el) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      const wrapper = triggerRef.current;
      // wrapper has display:contents so its own rect is empty;
      // measure the first rendered child instead.
      const target = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      setCoords(computeCoords(rect, FALLBACK_CARD_WIDTH, 0));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }

  function handleMouseLeave() {
    close();
  }

  function handlePointerDown() {
    // Drag start (dnd-kit) or any click — dismiss immediately.
    close();
  }

  // If parent flips disabled true mid-hover, force-close.
  useEffect(() => {
    if (disabled) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setOpen(false);
    }
  }, [disabled]);

  // After portal render, measure real card size and refine position.
  useLayoutEffect(() => {
    if (!open) return;
    const wrapper = triggerRef.current;
    const el = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
    const card = cardRef.current;
    if (!el || !card) return;
    const rect = el.getBoundingClientRect();
    const next = computeCoords(rect, card.offsetWidth, card.offsetHeight);
    setCoords((cur) =>
      cur && cur.top === next.top && cur.left === next.left ? cur : next,
    );
  }, [open]);

  // Cleanup any pending timer on unmount.
  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
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
              <PlayerInfoCard player={player} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
