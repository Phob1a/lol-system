import type { Tournament } from '@prisma/client';
import type { ArenaSignal } from '@/components/public-arena';
import type { DraftSnapshot } from '@/lib/draft/types';

export function getLiveStats(snapshot: DraftSnapshot) {
  return {
    teams: snapshot.teams.length,
    picks: snapshot.picks.length,
    pool: snapshot.pickedRegistrationIds.length,
    status: snapshot.session?.status ?? 'NOT_STARTED',
  };
}

export function getLiveSignals(
  selectedTournament: Tournament,
  snapshot: DraftSnapshot,
): ArenaSignal[] {
  return [
    { label: 'SEASON', detail: selectedTournament.name },
    { label: 'DRAFT', detail: snapshot.session?.status ?? 'NOT_STARTED' },
    { label: 'ROUND', detail: String(snapshot.session?.currentRound ?? 0) },
  ];
}
