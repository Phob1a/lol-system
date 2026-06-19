import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type WorkspaceMetricProps = {
  label: string;
  value: ReactNode;
  tone?: 'cyan' | 'amber' | 'violet';
  className?: string;
};

const toneClass = {
  cyan: 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100',
  amber: 'border-amber-200/30 bg-amber-200/10 text-amber-100',
  violet: 'border-violet-200/30 bg-violet-200/10 text-violet-100',
};

export function WorkspaceMetric({
  label,
  value,
  tone = 'cyan',
  className,
}: WorkspaceMetricProps) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 shadow-[0_0_24px_rgba(94,231,255,0.08)]',
        toneClass[tone],
        className,
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  );
}
