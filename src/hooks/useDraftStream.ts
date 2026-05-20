'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DraftSnapshot } from '@/lib/draft/types';

type State = {
  snapshot: DraftSnapshot | null;
  /**
   * The previous snapshot. Null on first load. Used for transition detection
   * (e.g. "you just went on the clock", "draft just started").
   */
  prevSnapshot: DraftSnapshot | null;
  loading: boolean;
  error: string | null;
  /** True while an SSE connection is open. */
  connected: boolean;
};

type UseDraftStreamOpts = {
  stateUrl?: string;
  streamUrl?: string;
};

/**
 * Subscribe to draft state. Strategy:
 *   1. Fetch initial snapshot via GET stateUrl (default: /api/draft/state).
 *   2. Open SSE connection to streamUrl (default: /api/draft/stream).
 *   3. On any "draft" event, refetch the snapshot.
 *
 * We fan out cheaply by always going to the API rather than diffing in
 * memory — keeps clients honest and avoids stale state after reconnect.
 *
 * The public spectator page can pass season-scoped URLs, e.g.:
 *   `/api/live/[seasonId]/state` and `/api/live/[seasonId]/stream`.
 */
export function useDraftStream(
  initial: DraftSnapshot | null = null,
  opts?: UseDraftStreamOpts,
) {
  const stateUrl = opts?.stateUrl ?? '/api/draft/state';
  const streamUrl = opts?.streamUrl ?? '/api/draft/stream';

  const [state, setState] = useState<State>({
    snapshot: initial,
    prevSnapshot: null,
    loading: initial == null,
    error: null,
    connected: false,
  });

  const reqIdRef = useRef(0);

  const fetchSnapshot = useCallback(async () => {
    const id = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(stateUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { snapshot: DraftSnapshot };
      if (id !== reqIdRef.current) return;
      setState((s) => ({
        ...s,
        prevSnapshot: s.snapshot,
        snapshot: body.snapshot,
        loading: false,
        error: null,
      }));
    } catch (e) {
      if (id !== reqIdRef.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'unknown error',
      }));
    }
  // stateUrl is derived from opts which is stable per render; including it
  // keeps the callback correct when a caller changes URLs between mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateUrl]);

  useEffect(() => {
    if (!initial) void fetchSnapshot();

    const es = new EventSource(streamUrl);
    es.addEventListener('open', () => {
      setState((s) => ({ ...s, connected: true }));
    });
    es.addEventListener('error', () => {
      setState((s) => ({ ...s, connected: false }));
    });
    es.addEventListener('hello', () => {
      setState((s) => ({ ...s, connected: true }));
    });
    es.addEventListener('draft', () => {
      void fetchSnapshot();
    });
    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, reload: fetchSnapshot };
}
