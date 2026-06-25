/**
 * Panel — NEXUS surface container.
 *
 * Structural pseudo-element CSS lives in nexus.css (bracket corners, scanlines,
 * glow rail). This file imports it once so all sibling components get the rules.
 *
 * COMMAND  — 2px radius, corner tick, optional scanline veil, optional glow variant
 * CELESTIAL — 4px radius, soft inset highlight border
 *
 * Usage:
 *   <Panel>…</Panel>
 *   <Panel glow>…</Panel>
 *   <Panel scan>…</Panel>
 *   <Panel as="section" className="p-4">…</Panel>
 */

// Import nexus.css once here — all other nexus components rely on this
// single import being present in the module graph.
import './nexus.css';

import { type ElementType, forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Render as a different element (default: 'div'). */
  as?: ElementType;
  /** Adds the glow variant (luminous top rail + scan drift on COMMAND). */
  glow?: boolean;
  /** Adds CRT scanline overlay (COMMAND style only). */
  scan?: boolean;
}

const Panel = forwardRef<HTMLElement, PanelProps>(
  (
    { as: Tag = 'div', glow = false, scan = false, className, children, ...rest },
    ref
  ) => {
    return (
      <Tag
        ref={ref}
        className={cn(
          // positioning anchor for pseudo-elements
          'relative min-w-0',
          // base surface
          'bg-nexus-panel border border-nexus-line',
          // per-style structural CSS classes from nexus.css
          'nexus-panel',
          glow && [
            'nexus-panel-glow',
            'overflow-hidden',
            'border-nexus-accent/50',
          ],
          scan && ['nexus-scan', 'overflow-hidden'],
          className
        )}
        {...rest}
      >
        {children}
      </Tag>
    );
  }
);

Panel.displayName = 'Panel';
export default Panel;
