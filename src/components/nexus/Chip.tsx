/**
 * Chip — inline tag / badge component.
 *
 * COMMAND  — 2px radius, inset glow on accent/hot variants (nexus.css)
 * CELESTIAL — 3px radius
 *
 * Variants:
 *   default — dim border + dim text
 *   ac      — accent border + accent text (+ COMMAND inset glow via nexus.css)
 *   good    — good (green) border + text
 *   hot     — hot (orange) border + text (+ COMMAND inset glow via nexus.css)
 *
 * Usage:
 *   <Chip>Default</Chip>
 *   <Chip variant="ac">Accent</Chip>
 *   <Chip variant="hot"><LiveDot /> LIVE</Chip>
 */

import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'default' | 'ac' | 'good' | 'hot';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

const variantClasses: Record<ChipVariant, string> = {
  default: 'border-nexus-line text-nexus-dim',
  ac:      'border-nexus-accent/60 text-nexus-accent nexus-chip-ac',
  good:    'border-nexus-good/60   text-nexus-good',
  hot:     'border-nexus-hot/60    text-nexus-hot   nexus-chip-hot',
};

const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ variant = 'default', className, children, ...rest }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          // layout
          'inline-flex items-center gap-[5px]',
          'h-5 px-[7px]',
          // typography
          'font-mono text-[10px] font-semibold uppercase tracking-[0.08em]',
          // base border
          'border',
          // per-style radius (2px command / 3px celestial — closest Tailwind
          // equivalent is the CSS-var token set per theme)
          'rounded-[var(--radius-nexus)]',
          // variant colours + nexus.css structural classes
          variantClasses[variant],
          className
        )}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

Chip.displayName = 'Chip';
export default Chip;
