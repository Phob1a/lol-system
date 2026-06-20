/**
 * Readout — mono numeric / data readout span.
 *
 * Matches the .readout rule from console.css:
 *   font-mono, tabular-nums, tracking -0.01em, nowrap
 *
 * COMMAND + serial prop — adds phosphor glow (static + pulsing, nexus.css .nexus-serial).
 *
 * Usage:
 *   <Readout>3.4</Readout>
 *   <Readout serial>00042</Readout>
 *   <Readout className="text-2xl text-nexus-accent">1,204</Readout>
 */

import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ReadoutProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * When true, applies the phosphor-glow "serial" treatment on COMMAND style.
   * Motion gating (@media prefers-reduced-motion) is handled in nexus.css.
   */
  serial?: boolean;
}

const Readout = forwardRef<HTMLSpanElement, ReadoutProps>(
  ({ serial = false, className, children, ...rest }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'font-mono tabular-nums tracking-[-0.01em] whitespace-nowrap',
          serial && 'nexus-serial',
          className
        )}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

Readout.displayName = 'Readout';
export default Readout;
