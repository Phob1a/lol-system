'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function useTournamentState(tournamentId: string | null) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectMs = useRef<number>(1000);

  const refetch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tournament/${id}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tournamentId) return;
    void refetch(tournamentId);

    const open = () => {
      const es = new EventSource(`/api/tournament/${tournamentId}/stream`);
      esRef.current = es;
      es.addEventListener('tournament', () => {
        void refetch(tournamentId);
      });
      es.onopen = () => { reconnectMs.current = 1000; };
      es.onerror = () => {
        es.close();
        const delay = Math.min(reconnectMs.current, 15000);
        reconnectMs.current = Math.min(reconnectMs.current * 2, 15000);
        setTimeout(open, delay);
      };
    };
    open();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [tournamentId, refetch]);

  return { state, loading, error, refetch: () => tournamentId && refetch(tournamentId) };
}
