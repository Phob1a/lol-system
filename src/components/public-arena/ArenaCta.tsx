import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ArenaCtaProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
};

const variantClass = {
  primary:
    'border-cyan-200/45 bg-cyan-200 text-slate-950 shadow-[0_0_28px_rgba(94,231,255,0.35)]',
  secondary: 'border-white/15 bg-white/5 text-white',
  ghost: 'border-cyan-200/25 bg-cyan-200/5 text-cyan-50',
};

export function ArenaCta({ href, children, variant = 'primary', className }: ArenaCtaProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center rounded border px-4 py-2 text-sm font-semibold transition hover:translate-y-[-1px]',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
