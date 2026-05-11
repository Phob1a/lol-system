'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function MatchesTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Matches (Task 25)</div>;
}
