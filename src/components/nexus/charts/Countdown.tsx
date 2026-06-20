'use client';

/**
 * Countdown — live ticking countdown to a target timestamp.
 * Ported from docs/design/nexus/prototype/pubextra.jsx.
 *
 * Updates every second via a setInterval that is cleaned up on unmount.
 *
 * Reduced-motion behaviour:
 *   The timer always ticks (state updates are not animation). Only the
 *   decorative text glow pulse is suppressed via
 *   @media (prefers-reduced-motion: no-preference), so the countdown
 *   remains fully functional for users who prefer reduced motion.
 *
 * Theme tokens consumed via CSS variables — never hardcoded hex.
 * Numbers rendered with fontVariantNumeric: 'tabular-nums' to prevent
 * layout shift as digits change.
 */

import { useEffect, useState } from 'react';

export interface CountdownProps {
  /**
   * Target date-time. Accepts any value supported by `new Date()`, e.g.
   * an ISO-8601 string `"2026-07-01T18:00:00Z"`, a unix epoch number, or
   * a Date object. The countdown floors to zero once the target is reached.
   */
  to: string | number | Date;
  /** Short label rendered to the left of the time cells. */
  label?: string;
}

interface TimeLeft {
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

function decompose(diffMs: number): TimeLeft {
  const safe = Math.max(0, diffMs);
  return {
    d: Math.floor(safe / 86_400_000),
    hh: Math.floor((safe % 86_400_000) / 3_600_000),
    mm: Math.floor((safe % 3_600_000) / 60_000),
    ss: Math.floor((safe % 60_000) / 1_000),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Decorative glow is only applied when the user has no preference against
 * motion/animation. The timer itself continues ticking regardless.
 */
const MOTION_STYLES = `
@media (prefers-reduced-motion: no-preference) {
  .countdown-accent {
    text-shadow: 0 0 12px rgb(var(--accent-n) / 0.7);
  }
}
`;

export function Countdown({ to, label }: CountdownProps) {
  const target = new Date(to).getTime();

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const diff = target - now;
  const { d, hh, mm, ss } = decompose(diff);

  function Cell({ value, unit }: { value: number; unit: string }) {
    return (
      <span
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <span
          className="countdown-accent"
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'rgb(var(--accent-n))',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {pad(value)}
        </span>
        <span
          style={{
            fontSize: 7.5,
            letterSpacing: '0.1em',
            color: 'rgb(var(--faint))',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            marginTop: 3,
          }}
        >
          {unit}
        </span>
      </span>
    );
  }

  const sep = (
    <span
      aria-hidden="true"
      style={{
        color: 'rgb(var(--faint))',
        fontFamily: 'var(--font-mono)',
        fontSize: 20,
        fontWeight: 300,
        lineHeight: 1,
        alignSelf: 'flex-start',
        paddingTop: 1,
      }}
    >
      :
    </span>
  );

  return (
    <>
      <style>{MOTION_STYLES}</style>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        aria-label={
          label
            ? `${label}: ${d} days ${pad(hh)} hours ${pad(mm)} minutes ${pad(ss)} seconds`
            : `${d} days ${pad(hh)} hours ${pad(mm)} minutes ${pad(ss)} seconds`
        }
        role="timer"
      >
        {label && (
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.12em',
              color: 'rgb(var(--faint))',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Cell value={d} unit="DAY" />
          {sep}
          <Cell value={hh} unit="HR" />
          {sep}
          <Cell value={mm} unit="MIN" />
          {sep}
          <Cell value={ss} unit="SEC" />
        </div>
      </div>
    </>
  );
}
