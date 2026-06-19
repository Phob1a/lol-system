import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ArenaStatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  tone?: 'cyan' | 'amber' | 'emerald' | 'violet';
  className?: string;
};

const toneClass = {
  cyan: 'text-cyan-200',
  amber: 'text-amber-200',
  emerald: 'text-emerald-200',
  violet: 'text-violet-200',
};

export function ArenaStatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'cyan',
  className,
}: ArenaStatCardProps) {
  return (
    <div className={cn('rounded border border-white/10 bg-slate-950/30 p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          {label}
        </p>
        <Icon className={cn('h-4 w-4', toneClass[tone])} />
      </div>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
    </div>
  );
}
