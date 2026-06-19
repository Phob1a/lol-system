import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type WorkspaceShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
  header?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WorkspaceShell({
  children,
  sidebar,
  header,
  className,
  contentClassName,
}: WorkspaceShellProps) {
  return (
    <div className={cn('arena-console workspace-console relative min-h-screen lg:flex', className)}>
      {sidebar}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {header}
        <main className={cn('flex min-h-0 flex-1 flex-col p-4 lg:p-6', contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
