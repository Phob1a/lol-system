'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { ThemeStyleProvider } from '@/components/layout/ThemeStyleProvider';
import { MatchDetailProvider } from '@/components/tournament/MatchDetailProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeStyleProvider>
      <SessionProvider>
        <MatchDetailProvider>
          {children}
        </MatchDetailProvider>
        <Toaster richColors position="top-center" />
      </SessionProvider>
    </ThemeStyleProvider>
  );
}
