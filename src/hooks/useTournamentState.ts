'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

export type PublicState = {
  tournament: { id: string; name: string; kind: string; status: string };
  matches: Array<{
    id: string;
    label: string | null;
    roundKey: string | null;
    bestOf: number;
    scheduledAt: string | null;
    status: string;
    isWalkover: boolean;
    teamA: { id: string; name: string } | null;
    teamB: { id: string; name: string } | null;
    winnerTeamId: string | null;
    groupId: string | null;
  }>;
  standings: Array<{
    groupId: string;
    name: string;
    teams: Record<string, string>;
    rows: Array<{
      teamId: string;
      played: number;
      wins: number;
      losses: number;
      points: number;
      rank: number;
      tied: boolean;
    }>;
  }>;
  bracket: Array<{
    roundKey: string;
    matches: Array<{
      id: string;
      label: string | null;
      teamAId: string | null;
      teamBId: string | null;
      winnerTeamId: string | null;
      status: string;
    }>;
  }>;
} | null;

export type AdminGameSummary = {
  id: string;
  index: number;
  isDraft: boolean;
  winnerTeamId: string | null;
  hasBans: boolean;
  hasStats: boolean;
};

export type AdminMatch = NonNullable<PublicState>['matches'][number] & {
  version: number;
  games: AdminGameSummary[];
};

export type AdminState = (Omit<NonNullable<PublicState>, 'tournament' | 'matches'> & {
  tournament: {
    id: string;
    name: string;
    kind: string;
    status: string;
    teamBudget: number;
    config: GroupKnockoutConfig;
  };
  matches: AdminMatch[];
}) | null;

export function useTournamentState() {
  const [state, setState] = useState<PublicState>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch('/api/tournament/public/state');
    const body = await res.json().catch(() => ({ state: null }));
    setState(body.state ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();

    // The stream route sends NAMED events (`event: tournament`) — not unnamed
    // events — so `es.onmessage` would never fire. We must use
    // `addEventListener('tournament', ...)` to match the house SSE style used
    // in the committed stream route (src/app/api/tournament/public/stream/route.ts).
    const es = new EventSource('/api/tournament/public/stream');

    es.addEventListener('tournament', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string };
        if (data.type === 'tournament.invalidated') void refetch();
      } catch {
        // ignore malformed frames
      }
    });

    return () => es.close();
  }, [refetch]);

  return { state, loaded, refetch };
}

export function useAdminTournamentState(tournamentId: string): {
  state: AdminState;
  loaded: boolean;
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<AdminState>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch('/api/tournament/admin/state?tournamentId=' + tournamentId);
    const body = await res.json().catch(() => ({ state: null }));
    setState(body.state ?? null);
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    void refetch();

    // Mirror useTournamentState: same public SSE stream carries the invalidation
    // signal for both public and admin read-models.
    const es = new EventSource('/api/tournament/public/stream');

    es.addEventListener('tournament', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string };
        if (data.type === 'tournament.invalidated') void refetch();
      } catch {
        // ignore malformed frames
      }
    });

    return () => es.close();
  }, [refetch, tournamentId]);

  return { state, loaded, refetch };
}
