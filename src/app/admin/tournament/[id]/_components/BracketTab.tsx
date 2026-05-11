'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function BracketTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Bracket (Task 26)</div>;
}
