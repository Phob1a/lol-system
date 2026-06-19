import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PublicArenaShellProps = {
  children: ReactNode;
  hud?: ReactNode;
  bleed?: boolean;
  className?: string;
  contentClassName?: string;
};

export function PublicArenaShell({
  children,
  hud,
  bleed = false,
  className,
  contentClassName,
}: PublicArenaShellProps) {
  return (
    <div className={cn('arena-console relative', bleed && '-mx-4 -my-6 md:-mx-8', className)}>
      {hud}
      <main
        className={cn(
          'relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8',
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
