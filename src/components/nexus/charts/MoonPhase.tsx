'use client';

/**
 * MoonPhase — almanac progress row.
 * Ported from docs/design/nexus/prototype/sig.jsx.
 *
 * Renders `total` circular moon-phase pips where pips before `current` are
 * filled (completed), the pip AT `current` is the active night, and pips
 * after are empty.
 *
 * Theme tokens consumed via CSS variables — never hardcoded hex.
 * No decorative animation; no reduced-motion guard needed here.
 */

export interface MoonPhaseProps {
  /** Total number of nights / stages to display. */
  total: number;
  /** Zero-based index of the current active stage. */
  current: number;
  /** Diameter in px for each pip circle. Defaults to 16. */
  size?: number;
}

export function MoonPhase({ total, current, size = 16 }: MoonPhaseProps) {
  const items: React.ReactNode[] = [];

  for (let i = 0; i < total; i++) {
    const done = i < current;
    const now = i === current;
    /**
     * Horizontal fill fraction within the pip (simulates the waxing
     * crescent / gibbous effect from the prototype's pseudo-moon rendering).
     * When only one pip exists the fraction is always 1.
     */
    const frac = total <= 1 ? 1 : i / (total - 1);

    items.push(
      <span
        key={i}
        title={`Night ${i + 1}`}
        style={{
          position: 'relative',
          width: size,
          height: size,
          display: 'inline-block',
          flexShrink: 0,
        }}
      >
        {/* Border ring + active glow */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1px solid ${now ? 'rgb(var(--accent-n))' : 'rgb(var(--line))'}`,
            background: done ? 'rgb(var(--accent-n) / 0.85)' : 'transparent',
            boxShadow: now ? '0 0 8px rgb(var(--accent-n))' : 'none',
          }}
        />
        {/* Horizontal fill slice (moon-phase crescent effect) */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${frac * 100}%`,
              background:
                done || now
                  ? 'rgb(var(--accent-n) / 0.5)'
                  : 'rgb(var(--ink) / 0.08)',
            }}
          />
        </span>
      </span>,
    );
  }

  return (
    <div
      style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}
      role="img"
      aria-label={`Progress: night ${current + 1} of ${total}`}
    >
      {items}
    </div>
  );
}
