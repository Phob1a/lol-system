import type { ReactNode } from 'react';
import { ArenaPanel } from './ArenaPanel';

type ArenaEmptyStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function ArenaEmptyState({ eyebrow, title, description, action }: ArenaEmptyStateProps) {
  return (
    <ArenaPanel className="mx-auto w-full max-w-lg p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </ArenaPanel>
  );
}
