'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type NexusStyle = 'command' | 'celestial';

const STORAGE_KEY = 'nexus.style';
const DEFAULT_STYLE: NexusStyle = 'command';

interface ThemeStyleContextValue {
  style: NexusStyle;
  setStyle: (style: NexusStyle) => void;
}

const ThemeStyleContext = createContext<ThemeStyleContextValue | null>(null);

export function useThemeStyle(): ThemeStyleContextValue {
  const ctx = useContext(ThemeStyleContext);
  if (!ctx) {
    throw new Error('useThemeStyle must be used within ThemeStyleProvider');
  }
  return ctx;
}

/** Reads nexus.style from localStorage (safe — returns default on error). */
function readPersistedStyle(): NexusStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'command' || stored === 'celestial') return stored;
  } catch {
    // localStorage unavailable (SSR / private browsing)
  }
  return DEFAULT_STYLE;
}

/** Applies data-style attribute and persists selection. */
function applyStyle(style: NexusStyle): void {
  document.documentElement.setAttribute('data-style', style);
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // ignore
  }
}

export function ThemeStyleProvider({ children }: { children: React.ReactNode }) {
  // Start with default so SSR render is deterministic; sync to persisted value
  // on mount (client only) to avoid hydration mismatch.
  const [style, setStyleState] = useState<NexusStyle>(DEFAULT_STYLE);

  // On mount: read persisted preference and apply immediately
  useEffect(() => {
    const persisted = readPersistedStyle();
    // Apply the attribute unconditionally so even 'command' (the default) is
    // explicitly set, making CSS attribute selectors reliable.
    applyStyle(persisted);
    setStyleState(persisted);
  }, []);

  function setStyle(next: NexusStyle) {
    setStyleState(next);
    applyStyle(next);
  }

  return (
    <ThemeStyleContext.Provider value={{ style, setStyle }}>
      {children}
    </ThemeStyleContext.Provider>
  );
}
