'use client';

/**
 * MatchDetailProvider — global context for the slide-over MatchDetail drawer.
 *
 * Usage:
 *   // Mount once (done in src/components/providers.tsx)
 *   <MatchDetailProvider>...</MatchDetailProvider>
 *
 *   // Open drawer from any component
 *   const { openMatch } = useMatchDrawer();
 *   openMatch('match-id-123');
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { MatchDrawer } from './MatchDetail';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface MatchDrawerContextValue {
  openMatch: (matchId: string) => void;
  close: () => void;
}

const MatchDrawerContext = createContext<MatchDrawerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMatchDrawer(): MatchDrawerContextValue {
  const ctx = useContext(MatchDrawerContext);
  if (!ctx) {
    throw new Error('useMatchDrawer must be used inside <MatchDetailProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MatchDetailProvider({ children }: { children: React.ReactNode }) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const openMatch = useCallback((matchId: string) => {
    setActiveMatchId(matchId);
  }, []);

  const close = useCallback(() => {
    setActiveMatchId(null);
  }, []);

  return (
    <MatchDrawerContext.Provider value={{ openMatch, close }}>
      {children}
      <MatchDrawer matchId={activeMatchId} onClose={close} />
    </MatchDrawerContext.Provider>
  );
}
