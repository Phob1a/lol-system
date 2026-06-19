import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type WorkspaceHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  signals?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  signals,
  actions,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        'border-b border-cyan-200/15 bg-slate-950/45 px-4 py-4 backdrop-blur-xl lg:px-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            {eyebrow}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
            <h1 className="text-lg font-black text-white">{title}</h1>
            {description ? (
              <p className="text-sm text-slate-300">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {signals}
          {actions}
        </div>
      </div>
    </header>
  );
}
