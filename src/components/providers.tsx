'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { ThemeStyleProvider } from '@/components/layout/ThemeStyleProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeStyleProvider>
      <SessionProvider>
        {children}
        <Toaster richColors position="top-center" />
      </SessionProvider>
    </ThemeStyleProvider>
  );
}
