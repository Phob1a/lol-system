import React, { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type LoadingButtonContentProps = {
  loading: boolean;
  children: ReactNode;
  loadingText?: ReactNode;
  className?: string;
};

export function LoadingButtonContent({
  loading,
  children,
  loadingText = children,
  className,
}: LoadingButtonContentProps) {
  if (!loading) return <>{children}</>;

  return (
    <>
      <Loader2 aria-hidden="true" className={cn('h-4 w-4 animate-spin', className)} />
      <span>{loadingText}</span>
    </>
  );
}
