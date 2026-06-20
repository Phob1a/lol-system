/**
 * Kicker — small mono uppercase label used as section / field identifiers.
 *
 * Matches the .kicker rule from console.css:
 *   font-mono, 10px, tracking 0.24em, uppercase, --faint color
 *
 * Renders as a <span> by default; use `as` to change to <p>, <label>, etc.
 *
 * Usage:
 *   <Kicker>Match ID</Kicker>
 *   <Kicker as="label" htmlFor="field-id">Summoner Name</Kicker>
 */

import { type ElementType, type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface KickerProps extends HTMLAttributes<HTMLElement> {
  /** Element to render (default: 'span'). */
  as?: ElementType;
}

const Kicker = forwardRef<HTMLElement, KickerProps>(
  ({ as: Tag = 'span', className, children, ...rest }, ref) => {
    return (
      <Tag
        ref={ref}
        className={cn(
          'font-mono text-[10px] font-normal uppercase tracking-[0.24em]',
          'text-nexus-faint',
          'whitespace-nowrap',
          className
        )}
        {...rest}
      >
        {children}
      </Tag>
    );
  }
);

Kicker.displayName = 'Kicker';
export default Kicker;
