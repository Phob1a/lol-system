'use client';

import { TournamentArenaView } from '@/components/tournament/arena/TournamentArenaView';
import { useTournamentState } from '@/hooks/useTournamentState';

export function PublicTournamentView() {
  const { state, loaded } = useTournamentState();

  return <TournamentArenaView state={state} loaded={loaded} />;
}
