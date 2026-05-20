'use client';

import { useMemo } from 'react';
import type { Season } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import type { RegistrationForPool } from '@/lib/filters';
import { useDraftStream } from '@/hooks/useDraftStream';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero } from '@/components/draft/OnTheClockHero';
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { POSITION_LABEL } from '@/components/players/positions';
import { SeasonSelector } from './SeasonSelector';

type PoolEntry = Omit<RegistrationForPool, 'isPicked'>;

type Props = {
  seasons: Season[];
  selectedSeason: Season;
  initialSnapshot: DraftSnapshot;
  poolRegistrations: PoolEntry[];
};

export function SpectatorView({ seasons, selectedSeason, initialSnapshot, poolRegistrations }: Props) {
  const stateUrl = `/api/live/${selectedSeason.id}/state`;
  const streamUrl = `/api/live/${selectedSeason.id}/stream`;

  // Always call useDraftStream unconditionally (Rules of Hooks).
  // For COMPLETED/ARCHIVED seasons the SSE yields nothing new — that is fine.
  const { snapshot } = useDraftStream(initialSnapshot, { stateUrl, streamUrl });

  const live = snapshot ?? initialSnapshot;

  const session = live.session ?? null;
  const onTheClockId = session?.onTheClock ?? null;
  const currentRound = session?.currentRound ?? 0;

  // Derive on-the-clock team for hero
  const onTheClockTeam = onTheClockId
    ? (live.teams.find((t) => t.captainId === onTheClockId) ?? null)
    : null;
  const heroTeamName = onTheClockTeam?.captainNickname ?? null;
  const heroBudgetLeft = onTheClockTeam?.budgetLeft ?? null;
  const heroMissingPositions = onTheClockTeam
    ? onTheClockTeam.slots.filter((s) => s.registration === null).map((s) => s.position)
    : [];
  const heroPickedCount = onTheClockTeam
    ? Math.max(0, onTheClockTeam.slots.filter((s) => s.registration !== null).length - 1)
    : 0;

  // Build lookup maps for EventStream
  const teamById = useMemo(() => {
    const m = new Map<string, (typeof live.teams)[number]>();
    for (const t of live.teams) m.set(t.id, t);
    return m;
  }, [live.teams]);

  const registrationNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of live.teams) {
      for (const slot of t.slots) {
        if (slot.registration) m.set(slot.registration.id, slot.registration.nickname);
      }
    }
    return m;
  }, [live.teams]);

  // Build EventStream events from picks (most recent first)
  const streamEvents = useMemo(() => {
    const picks = live.picks ?? [];
    return [...picks].reverse().map((pick) => {
      const team = teamById.get(pick.teamId);
      const regName = registrationNameById.get(pick.registrationId) ?? pick.registrationId;
      const label = `「${team?.captainNickname ?? '—'}」选中 ${regName} · ${POSITION_LABEL[pick.position]} · ${pick.costPaid}`;
      return { id: pick.id, label };
    });
  }, [live.picks, teamById, registrationNameById]);

  // Decorate the pool: mark each entry isPicked when its id is in the live snapshot.
  const pickedSet = useMemo(
    () => new Set(live.pickedRegistrationIds),
    [live.pickedRegistrationIds],
  );
  const decoratedPool = useMemo(
    () => poolRegistrations.map((p) => ({ ...p, isPicked: pickedSet.has(p.id) })),
    [poolRegistrations, pickedSet],
  );

  return (
    <div>
      {/* Season selector header row */}
      <div className="mb-3 flex items-center gap-3">
        <SeasonSelector seasons={seasons} selectedId={selectedSeason.id} />
      </div>

      <BroadcastLayout
        hero={
          <OnTheClockHero
            teamName={heroTeamName}
            round={currentRound}
            budgetLeft={heroBudgetLeft}
            missingPositions={heroMissingPositions}
            pickedCount={heroPickedCount}
            slotCount={5}
          />
        }
        grid={
          <TeamGrid
            teams={live.teams}
            onTheClockId={onTheClockId}
            maxBudget={selectedSeason.teamBudget}
          />
        }
        pool={<PlayerPool players={decoratedPool} />}
        events={<EventStream events={streamEvents} />}
      />
    </div>
  );
}
