'use client';
import type { TournamentState } from '@/lib/tournament/tournament-state';
export function SetupTab(_: { state: TournamentState; onChange: () => void }) {
  return <div className="text-muted-foreground">Setup (Task 23)</div>;
}
