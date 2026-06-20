/**
 * PosPip — position pip glyph.
 *
 * Renders a square badge displaying the CJK glyph for each LoL lane,
 * optionally lit (accent colour + glow) or unlit (dim).
 *
 * Position codes match the prototype's POS_CHAR map:
 *   TOP | JUNGLE | MID | ADC | SUPPORT
 *
 * Usage:
 *   <PosPip pos="MID" on />
 *   <PosPip pos="SUPPORT" size={40} />
 */

import React from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Position = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export interface PosPipProps {
  /** The lane/role identifier. */
  pos: Position;
  /**
   * Whether the pip is in the "active / selected" state (lit with accent
   * colour and glow). Defaults to false (dim state).
   */
  on?: boolean;
  /**
   * Outer side length in px. Font size scales with it (50 % of size).
   * Defaults to 24.
   */
  size?: number;
  /** Extra class names forwarded to the root <span>. */
  className?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maps each position code to the CJK single-character glyph shown in the pip.
 * Mirrors data.js → POS_CHAR.
 */
const POS_CHAR: Record<Position, string> = {
  TOP:     '上',
  JUNGLE:  '野',
  MID:     '中',
  ADC:     '射',
  SUPPORT: '辅',
};

/**
 * Maps each position code to its full Chinese label.
 * Used for the accessible title / aria-label.
 */
const POS_LABEL: Record<Position, string> = {
  TOP:     '上单',
  JUNGLE:  '打野',
  MID:     '中单',
  ADC:     '射手',
  SUPPORT: '辅助',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PosPip({ pos, on = false, size = 24, className }: PosPipProps) {
  const glyph = POS_CHAR[pos] ?? pos[0];
  const label = POS_LABEL[pos] ?? pos;
  const fontSize = Math.round(size * 0.5);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{
        // Layout
        display:       'inline-grid',
        placeItems:    'center',
        flexShrink:    0,
        width:         size,
        height:        size,
        borderRadius:  'var(--radius-nexus, 4px)',

        // Typography
        fontFamily:    'var(--font-display)',
        fontSize:      fontSize,
        fontWeight:    700,
        lineHeight:    1,
        fontVariantNumeric: 'tabular-nums',

        // Colour — on: accent + subtle fill + glow; off: dim + no fill
        color:         on ? 'rgb(var(--accent-n))' : 'rgb(var(--dim))',
        background:    on ? 'rgb(var(--accent-n) / 0.14)' : 'transparent',
        border:        on
          ? '1px solid rgb(var(--accent-n))'
          : '1px solid rgb(var(--line))',
        boxShadow:     on ? '0 0 9px rgb(var(--accent-n) / 0.4)' : 'none',
      }}
    >
      {glyph}
    </span>
  );
}

export default PosPip;
