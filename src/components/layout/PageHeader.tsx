import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded border border-cyan-200/20 bg-slate-950/35 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-300">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
