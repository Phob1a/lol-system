/**
 * Tile — stat tile with icon + label + value layout.
 *
 * COMMAND  — 2px radius, corner registration tick (top-right via nexus.css),
 *            lift + accent border on hover
 * CELESTIAL — 4px radius, same structure, no tick
 *
 * Usage:
 *   <Tile icon={<svg>…</svg>} label="Wins" value="24" />
 *   <Tile label="KDA" value="3.4" />
 */

import { type HTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TileProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon node rendered in the accent-colored glyph slot (30×30). */
  icon?: ReactNode;
  /** Small kicker label above the value. */
  label?: ReactNode;
  /** Primary value (rendered as a readout / large number). */
  value?: ReactNode;
  /** Optional sub-label / secondary line below value. */
  sub?: ReactNode;
}

const Tile = forwardRef<HTMLDivElement, TileProps>(
  ({ icon, label, value, sub, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex items-center gap-3',
          'px-[15px] py-[13px]',
          'bg-nexus-panel-2 border border-nexus-line',
          // per-style radius expressed as Tailwind CSS-variable shorthand
          // (actual switching is done by the token block in globals.css)
          'rounded-[var(--radius-nexus)]',
          // structural class for ::after corner tick + hover lift (nexus.css)
          'nexus-tile',
          className
        )}
        {...rest}
      >
        {icon != null && (
          <div
            className="w-[30px] h-[30px] grid place-items-center text-nexus-accent shrink-0"
          >
            {icon}
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0">
          {label != null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint whitespace-nowrap">
              {label}
            </span>
          )}
          {value != null && (
            <span className="font-mono tabular-nums text-nexus-ink leading-none whitespace-nowrap">
              {value}
            </span>
          )}
          {sub != null && (
            <span className="font-mono text-[10px] text-nexus-dim whitespace-nowrap">
              {sub}
            </span>
          )}
          {children}
        </div>
      </div>
    );
  }
);

Tile.displayName = 'Tile';
export default Tile;
