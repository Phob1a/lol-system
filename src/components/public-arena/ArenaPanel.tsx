import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ArenaPanelProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  className?: string;
};

export function ArenaPanel({ children, eyebrow, title, action, className }: ArenaPanelProps) {
  return (
    <section className={cn('arena-panel arena-corner relative overflow-hidden p-5', className)}>
      {(eyebrow || title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h2 className="mt-2 text-xl font-bold text-white">{title}</h2> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
