/**
 * DTile — data grid cell tile (the .dtile from prototype).
 *
 * Lighter than Tile — designed for 2-4 column data grids.
 * COMMAND  — 2px radius, corner tick, lift on hover (nexus.css .nexus-dtile)
 * CELESTIAL — 4px radius, no tick
 *
 * Usage:
 *   <DTile label="AVG KDA" value="4.12" />
 *   <DTile label="Win Rate" value="68%" sub="+3% this week" />
 */

import { type HTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Kicker label above the value. */
  label?: ReactNode;
  /**
   * Primary value — displayed in display font, weight 700, ~30px.
   * Numeric values should use tabular-nums (applied automatically).
   */
  value?: ReactNode;
  /** Optional secondary line below value. */
  sub?: ReactNode;
}

const DTile = forwardRef<HTMLDivElement, DTileProps>(
  ({ label, value, sub, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative',
          'px-4 py-[14px]',
          'bg-nexus-panel-2 border border-nexus-line',
          'rounded-[var(--radius-nexus)]',
          // structural class for ::after corner tick + hover (nexus.css)
          'nexus-dtile',
          className
        )}
        {...rest}
      >
        {label != null && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint mb-1 whitespace-nowrap">
            {label}
          </p>
        )}
        {value != null && (
          <p className="font-display font-bold text-[30px] leading-none tabular-nums text-nexus-ink">
            {value}
          </p>
        )}
        {sub != null && (
          <p className="font-mono text-[10px] text-nexus-dim mt-1 whitespace-nowrap">
            {sub}
          </p>
        )}
        {children}
      </div>
    );
  }
);

DTile.displayName = 'DTile';
export default DTile;
