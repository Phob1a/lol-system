'use client';

import { useMemo } from 'react';
import type { Tournament } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import type { RegistrationForPool } from '@/lib/filters';
import { useDraftStream } from '@/hooks/useDraftStream';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero, type HeroStatus } from '@/components/draft/OnTheClockHero';
import {
  ArenaPanel,
  ArenaStatCard,
  PublicArenaHud,
  PublicArenaShell,
} from '@/components/public-arena';

// Mirrors engine.ts TOTAL_ROUNDS — kept inline so this client component
// doesn't transitively pull the Prisma-laden engine module into the bundle.
const TOTAL_ROUNDS = 4;
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { POSITION_LABEL } from '@/components/players/positions';
import { SeasonSelector } from './SeasonSelector';
import { formatCost } from '@/lib/costs';
import { getLiveSignals, getLiveStats } from '@/lib/live/live-arena';
import { Activity, RadioTower, ShieldCheck, Swords } from 'lucide-react';

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
  }, [session, onTheClockTeam, currentRound, live]);

  // Build lookup maps for EventStream
  const teamById = useMemo(() => {
    const m = new Map<string, (typeof live.teams)[number]>();
    for (const t of live.teams) m.set(t.id, t);
    return m;
  }, [live]);

  const registrationNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of live.teams) {
      for (const slot of t.slots) {
        if (slot.registration) m.set(slot.registration.id, slot.registration.nickname);
      }
    }
    return m;
  }, [live]);

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
  const stats = getLiveStats(live);
  const pulseBars = [36, 54, 72, 48, 84, 62, 74, 52, 88, 68, 58, 78];

  return (
    <PublicArenaShell
      hud={
        <PublicArenaHud
          eyebrow="LOL-SYSTEM / LIVE SPECTATOR"
          title="LIVE COMMAND VIEW"
          signals={getLiveSignals(selectedTournament, live)}
          actions={<SeasonSelector tournaments={tournaments} selectedId={selectedTournament.id} />}
        />
      }
      className="min-h-screen"
      contentClassName="max-w-none lg:min-h-[calc(100vh-8.5rem)]"
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.72fr]">
        <ArenaPanel eyebrow="/LIVE SPECTATOR" title="LIVE COMMAND VIEW" className="arena-scanline">
          <p className="max-w-3xl text-sm leading-7 text-slate-300">
            直播页保留控制台形态：当前 BP、队伍席位、选手池和事件流在同一屏联动，观众只读同步进度。
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ArenaStatCard icon={Swords} label="队伍" value={String(stats.teams)} detail="参选队伍" />
            <ArenaStatCard
              icon={RadioTower}
              label="出手"
              value={String(stats.picks)}
              detail={`${stats.pool} 名已锁定`}
              tone="amber"
            />
            <ArenaStatCard
              icon={ShieldCheck}
              label="状态"
              value={stats.status}
              detail="观众只读模式"
              tone="emerald"
            />
          </div>
        </ArenaPanel>

        <ArenaPanel eyebrow="STREAM SYNCED" title="TEAM PULSE">
          <div className="flex h-24 items-end gap-2">
            {pulseBars.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500/35 via-cyan-200/75 to-white shadow-[0_0_18px_rgba(94,231,255,0.35)]"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            <span className="inline-flex items-center gap-2 border border-cyan-200/15 bg-cyan-200/5 px-3 py-2">
              <Activity className="h-3.5 w-3.5" />
              BP Phase
            </span>
            <span className="inline-flex items-center gap-2 border border-cyan-200/15 bg-cyan-200/5 px-3 py-2">
              <RadioTower className="h-3.5 w-3.5" />
              Event Feed
            </span>
          </div>
        </ArenaPanel>
      </div>
      <BroadcastLayout
        defaultMobileTab="grid"
        hero={
          <ArenaPanel eyebrow="ON THE CLOCK" title="实时选秀舞台">
            <OnTheClockHero {...heroProps} />
          </ArenaPanel>
        }
        grid={
          <ArenaPanel eyebrow="TEAM GRID" title="队伍席位">
            <TeamGrid
              teams={live.teams}
              onTheClockId={onTheClockId}
              maxBudget={selectedTournament.teamBudget}
            />
          </ArenaPanel>
        }
        pool={
          <ArenaPanel eyebrow="PLAYER POOL" title="选手池">
            <PlayerPool players={decoratedPool} />
          </ArenaPanel>
        }
        events={
          <ArenaPanel eyebrow="EVENT STREAM" title="事件流">
            <EventStream events={streamEvents} />
          </ArenaPanel>
        }
      />
    </PublicArenaShell>
  );
}
