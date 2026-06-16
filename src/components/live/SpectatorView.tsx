'use client';

import { useMemo } from 'react';
import type { Tournament } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import type { RegistrationForPool } from '@/lib/filters';
import { useDraftStream } from '@/hooks/useDraftStream';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero, type HeroStatus } from '@/components/draft/OnTheClockHero';

// Mirrors engine.ts TOTAL_ROUNDS — kept inline so this client component
// doesn't transitively pull the Prisma-laden engine module into the bundle.
const TOTAL_ROUNDS = 4;
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { POSITION_LABEL } from '@/components/players/positions';
import { SeasonSelector } from './SeasonSelector';
import { formatCost } from '@/lib/costs';

type PoolEntry = Omit<RegistrationForPool, 'isPicked'>;

type Props = {
  tournaments: Tournament[];
  selectedTournament: Tournament;
  initialSnapshot: DraftSnapshot;
  poolRegistrations: PoolEntry[];
};

export function SpectatorView({ tournaments, selectedTournament, initialSnapshot, poolRegistrations }: Props) {
  const stateUrl = `/api/live/${selectedTournament.id}/state`;
  const streamUrl = `/api/live/${selectedTournament.id}/stream`;

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

  const heroProps: HeroStatus = useMemo(() => {
    if (!session || session.status === 'NOT_STARTED') return { status: 'pending' };
    if (session.status === 'FINISHED') {
      return {
        status: 'completed',
        teamCount: live.teams.length,
        totalPicks: live.picks.length,
      };
    }
    if (onTheClockTeam) {
      const missing = onTheClockTeam.slots
        .filter((s) => s.registration === null)
        .map((s) => s.position);
      const picked = Math.max(
        0,
        onTheClockTeam.slots.filter((s) => s.registration !== null).length - 1,
      );
      return {
        status: 'on-the-clock',
        teamName: onTheClockTeam.captainNickname,
        round: currentRound,
        budgetLeft: onTheClockTeam.budgetLeft,
        missingPositions: missing,
        pickedCount: picked,
        slotCount: 5,
      };
    }
    return { status: 'waiting', round: currentRound, totalRounds: TOTAL_ROUNDS };
  }, [session, onTheClockTeam, currentRound, live.teams.length, live.picks.length]);

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
      const label = `「${team?.captainNickname ?? '—'}」选中 ${regName} · ${POSITION_LABEL[pick.position]} · ${formatCost(pick.costPaid)}`;
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
    <div className="min-h-screen bg-background p-4">
      {/* Season selector header row */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg font-semibold text-foreground">Live Draft</span>
        <SeasonSelector tournaments={tournaments} selectedId={selectedTournament.id} />
      </div>

      <BroadcastLayout
        defaultMobileTab="grid"
        hero={<OnTheClockHero {...heroProps} />}
        grid={
          <TeamGrid
            teams={live.teams}
            onTheClockId={onTheClockId}
            maxBudget={selectedTournament.teamBudget}
          />
        }
        pool={<PlayerPool players={decoratedPool} />}
        events={<EventStream events={streamEvents} />}
      />
    </div>
  );
}
