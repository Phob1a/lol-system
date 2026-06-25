/**
 * PanelHead — header strip inside a Panel.
 *
 * Renders a flex row with a bottom divider and standard padding.
 * Accepts a title string + optional right-side slot (actions, chips, etc.).
 *
 * COMMAND  — mono uppercase label, tight tracking
 * CELESTIAL — same structure, softer color
 *
 * Usage:
 *   <PanelHead title="Match Schedule" actions={<Chip>Live</Chip>} />
 */

import { type HTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PanelHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Section title rendered as a kicker-style label. */
  title?: ReactNode;
  /** Optional right-side slot (buttons, chips, badges). */
  actions?: ReactNode;
}

const PanelHead = forwardRef<HTMLDivElement, PanelHeadProps>(
  ({ title, actions, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex min-w-0 items-center justify-between gap-3',
          'px-4 py-3',
          'border-b border-nexus-line',
          className
        )}
        {...rest}
      >
        {title != null && (
          <span
            className={cn(
              'min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.24em]',
              'text-nexus-faint',
            )}
          >
            {title}
          </span>
        )}
        {/* caller-supplied inline children (e.g. tab bars) */}
        {children}
        {actions != null && (
          <div className="flex items-center gap-2 ml-auto shrink-0">{actions}</div>
        )}
      </div>
    );
  }
);

PanelHead.displayName = 'PanelHead';
export default PanelHead;
