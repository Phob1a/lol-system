/**
 * ChampAvatar — champion portrait tile for the NEXUS UI.
 *
 * Renders a real Data Dragon portrait clipped to a hexagon (command style)
 * or a circle (celestial style). The clip shape is driven by the
 * [data-style] attribute on :root — it does NOT depend on a React prop so
 * that theme switching is handled purely in CSS.
 *
 * Falls back to a CSS monogram tile when the champion cannot be found in the
 * local champions.json index, or while the image is loading / broken.
 *
 * Lookup priority for the `champion` prop value:
 *   1. English key  (e.g. "Yasuo", "LeeSin")
 *   2. Chinese name (e.g. "疾风剑豪", "盲僧")
 *   3. Chinese title (e.g. "亚索", "李青")
 *
 * Usage:
 *   <ChampAvatar champion="亚索" size={48} />
 *   <ChampAvatar champion="Yasuo" size={32} />
 */

'use client';

import React, { useState } from 'react';
import championsData from '@/data/champions.json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChampAvatarProps {
  /**
   * Champion identifier — accepts:
   *   - English key (Data Dragon id), e.g. "Yasuo"
   *   - Chinese name field, e.g. "疾风剑豪"
   *   - Chinese title field, e.g. "亚索"
   */
  champion: string;
  /**
   * Side length in px for the square bounding box (before clipping).
   * Defaults to 26.
   */
  size?: number;
  /** Extra class names forwarded to the root element. */
  className?: string;
}

// ── Data index ────────────────────────────────────────────────────────────────

interface ChampEntry {
  key:    string;
  riotId: number;
  name:   string;   // Chinese name, e.g. "疾风剑豪"
  title:  string;   // Chinese title / common name, e.g. "亚索"
}

const { version, champions } = championsData as {
  version:   string;
  champions: ChampEntry[];
};

/** Single-pass lookup: O(n) but n <= ~200, called once per render. */
function findChampion(query: string): ChampEntry | undefined {
  if (!query) return undefined;
  const q = query.trim();
  return (
    champions.find((c) => c.key === q) ??
    champions.find((c) => c.name === q) ??
    champions.find((c) => c.title === q)
  );
}

function portraitUrl(key: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

// ── CSS clip-path values ───────────────────────────────────────────────────────
//
// command   -> flat-top hexagon (matches the client HUD aesthetic)
// celestial -> circle           (soft, celestial theme)
//
// These are injected as a <style> block once so we avoid inline CSS duplication.
// Keying on :root[data-style="..."] .nexus-champ-av means we only need one
// class on the element -- no JS theming needed at render time.

const CLIP_STYLES = `
  /* Hexagon for command style (pointy-top, six equal sides) */
  :root[data-style="command"] .nexus-champ-av {
    clip-path: polygon(
      50% 0%,
      100% 25%, 100% 75%,
      50% 100%,
      0% 75%, 0% 25%
    );
    border-radius: 0;
    border: none;
  }

  /* Circle for celestial style */
  :root[data-style="celestial"] .nexus-champ-av {
    clip-path: circle(50% at 50% 50%);
    border-radius: 50%;
    border: none;
  }

  /* Decorative glow -- gated behind prefers-reduced-motion */
  @media (prefers-reduced-motion: no-preference) {
    :root[data-style="command"] .nexus-champ-av,
    :root[data-style="celestial"] .nexus-champ-av {
      transition: filter 0.2s ease, transform 0.15s ease;
    }
    :root[data-style="command"] .nexus-champ-av:hover {
      filter: drop-shadow(0 0 6px rgb(var(--accent-n) / 0.7));
      transform: scale(1.06);
    }
    :root[data-style="celestial"] .nexus-champ-av:hover {
      filter: drop-shadow(0 0 6px rgb(var(--accent-n) / 0.6));
      transform: scale(1.06);
    }
  }
`;

// Inject the shared CSS once on the client (idempotent via id check).
let _styleInjected = false;
function ensureStyles(): void {
  if (_styleInjected || typeof document === 'undefined') return;
  const id = 'nexus-champ-av-styles';
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = CLIP_STYLES;
    document.head.appendChild(el);
  }
  _styleInjected = true;
}

// ── Monogram fallback ─────────────────────────────────────────────────────────

interface MonogramTileProps {
  champion: string;
  size: number;
  className?: string;
}

function MonogramTile({ champion, size, className }: MonogramTileProps) {
  const initial = champion ? champion[0].toUpperCase() : '?';
  return (
    <span
      className={['nexus-champ-av', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={champion || 'Unknown champion'}
      style={{
        display:       'inline-grid',
        placeItems:    'center',
        width:         size,
        height:        size,
        flexShrink:    0,
        fontFamily:    'var(--font-display)',
        fontWeight:    700,
        fontSize:      Math.round(size * 0.46),
        lineHeight:    1,
        // Use tabular-nums so single CJK chars render at consistent width
        fontVariantNumeric: 'tabular-nums',
        color:         'rgb(var(--ink))',
        background:    'linear-gradient(135deg, rgb(var(--accent-n) / 0.28), rgb(var(--panel-2)))',
        border:        '1px solid rgb(var(--line))',
        // Default shape — overridden by the data-style CSS above
        borderRadius:  'var(--radius-nexus, 4px)',
        userSelect:    'none',
      }}
    >
      {initial}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChampAvatar({ champion, size = 26, className }: ChampAvatarProps) {
  // Inject shared clip-path CSS on first client render
  if (typeof window !== 'undefined') {
    ensureStyles();
  }

  const entry = findChampion(champion);
  const [imgFailed, setImgFailed] = useState(false);

  // Fall back to monogram when champion is unknown or image load fails
  if (!entry || imgFailed) {
    return <MonogramTile champion={champion} size={size} className={className} />;
  }

  const src = portraitUrl(entry.key);
  // Prefer the title (common/popular Chinese name) as the accessible label
  const displayName = entry.title || entry.name || entry.key;

  return (
    <span
      className={['nexus-champ-av', className].filter(Boolean).join(' ')}
      style={{
        display:      'inline-block',
        width:        size,
        height:       size,
        flexShrink:   0,
        overflow:     'hidden',
        // Default shape before data-style CSS takes over
        borderRadius: 'var(--radius-nexus, 4px)',
        position:     'relative',
      }}
      title={displayName}
      aria-label={displayName}
    >
      {/* Standard <img> — next/image requires remotePatterns for external CDN,
          which would force a next.config change outside the permitted scope. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={displayName}
        onError={() => setImgFailed(true)}
        style={{
          width:           '100%',
          height:          '100%',
          // Data Dragon tiles have slight internal padding;
          // cover + top-center keeps the face prominent.
          objectFit:       'cover',
          objectPosition:  'center top',
          display:         'block',
          // Hide broken-image chrome until the error handler fires
          color:           'transparent',
        }}
        draggable={false}
      />
    </span>
  );
}

export default ChampAvatar;
