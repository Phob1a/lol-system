/**
 * NexusButton — NEXUS themed button.
 *
 * Heights: 36px default / 28px with size="sm"
 * Font: mono, 12px (11px sm), uppercase, tracking 0.06em
 *
 * COMMAND  — 8px corner clip-path + hover light-sweep animation (nexus.css)
 * CELESTIAL — 4px radius, plain hover
 *
 * Variants:
 *   default  — panel-2 bg, line border; hover → accent border + text
 *   primary  — filled accent bg + glow; COMMAND pulses (nexus.css)
 *
 * Usage:
 *   <NexusButton>Secondary</NexusButton>
 *   <NexusButton variant="primary">Start Draft</NexusButton>
 *   <NexusButton size="sm" variant="primary">Confirm</NexusButton>
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type NexusButtonVariant = 'default' | 'primary';
export type NexusButtonSize = 'default' | 'sm';

export interface NexusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NexusButtonVariant;
  size?: NexusButtonSize;
}

const NexusButton = forwardRef<HTMLButtonElement, NexusButtonProps>(
  (
    {
      variant = 'default',
      size = 'default',
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const isPrimary = variant === 'primary';
    const isSm = size === 'sm';

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // layout
          'inline-flex items-center justify-center gap-[7px]',
          // typography
          'font-mono font-semibold uppercase tracking-[0.06em]',
          // base
          'border cursor-pointer transition-all duration-150',
          'rounded-[var(--radius-nexus)]',
          // height + padding + font-size
          isSm
            ? 'h-7 px-[10px] text-[11px]'
            : 'h-9 px-[15px] text-[12px]',
          // variant colours
          isPrimary
            ? [
                'bg-nexus-accent text-nexus-bg border-transparent',
                'hover:brightness-110 hover:text-nexus-bg',
                'shadow-[0_0_20px_rgb(var(--accent-n)_/_calc(var(--glow)*0.4))]',
                // nexus.css handles: clip-path + pulse animation on command
                'nexus-btn nexus-btn-primary',
              ]
            : [
                'bg-nexus-panel-2 text-nexus-ink border-nexus-line',
                'hover:border-nexus-accent/65 hover:text-nexus-accent',
                // nexus.css handles: clip-path + sweep animation on command
                'nexus-btn',
              ],
          className
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

NexusButton.displayName = 'NexusButton';
export default NexusButton;
