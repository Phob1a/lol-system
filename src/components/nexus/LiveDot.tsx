/**
 * LiveDot — pulsing live-status indicator dot.
 *
 * COMMAND  — orange (--hot) pulse animation (nexus.css .nexus-live-dot)
 * CELESTIAL — green (--good) pulse animation (nexus.css .nexus-live-dot)
 *
 * All animation gated behind @media (prefers-reduced-motion: no-preference)
 * in nexus.css.
 *
 * Usage:
 *   <LiveDot />
 *   <Chip variant="hot"><LiveDot /> LIVE</Chip>
 */

import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type LiveDotProps = HTMLAttributes<HTMLSpanElement>;

const LiveDot = forwardRef<HTMLSpanElement, LiveDotProps>(
  ({ className, ...rest }, ref) => {
    return (
      <span
        ref={ref}
        // nexus.css owns the background, box-shadow, and animation per style
        className={cn('nexus-live-dot', className)}
        aria-label="live"
        role="img"
        {...rest}
      />
    );
  }
);

LiveDot.displayName = 'LiveDot';
export default LiveDot;
