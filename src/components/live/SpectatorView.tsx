'use client';

import { useMemo } from 'react';
import type { Season } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import { useDraftStream } from '@/hooks/useDraftStream';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero } from '@/components/draft/OnTheClockHero';
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { POSITION_LABEL } from '@/components/players/positions';
import { SeasonSelector } from './SeasonSelector';

type Props = {
  seasons: Season[];
  selectedSeason: Season;
  initialSnapshot: DraftSnapshot;
};

export function SpectatorView({ seasons, selectedSeason, initialSnapshot }: Props) {
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

  // Pool slot: DraftSnapshot does not include the full candidate roster — only
  // teams/slots/picks. Rendering a placeholder panel is the correct choice here
  // rather than fabricating data.
  const poolNode = (
    <div className="tc-card" style={{ padding: 12 }}>
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="tc-label" style={{ fontSize: 10, marginBottom: 8 }}>选手池</div>
      <div className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-text-dim)' }}>
        {live.pickedRegistrationIds.length} 人已选
      </div>
    </div>
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
        pool={poolNode}
        events={<EventStream events={streamEvents} />}
      />
    </div>
  );
}
