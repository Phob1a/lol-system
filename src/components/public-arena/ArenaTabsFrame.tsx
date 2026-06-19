import type { ReactNode } from 'react';

export function ArenaTabsFrame({ children }: { children: ReactNode }) {
  return (
    <div className="arena-panel rounded border border-cyan-200/15 bg-slate-950/35 p-4 md:p-5">
      {children}
    </div>
  );
}
