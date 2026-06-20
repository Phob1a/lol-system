'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Position } from '@prisma/client';
import { toast } from 'sonner';
import { useDraftStream } from '@/hooks/useDraftStream';
import type { DraftSnapshot } from '@/lib/draft/types';
import type { TeamPreview, RegistrationRef } from '@/lib/teams/preview';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { TeamPanel } from '@/components/draft/TeamPanel';
import { DraggableTeamBoard } from '@/components/captain/DraggableTeamBoard';
import { PickAction } from '@/components/captain/PickAction';
import {
  CaptainNotificationDialog,
  type CaptainNoticeKind,
} from '@/components/captain/CaptainNotificationDialog';
import { formatCost, normalizeCost } from '@/lib/costs';
import { cn } from '@/lib/utils';
import { resolveDraftPickDrop } from '@/lib/draft/drag-pick';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import LiveDot from '@/components/nexus/LiveDot';

type Props = {
  initialSnapshot: DraftSnapshot;
  pool: RegistrationRef[];
  virtualTeams: TeamPreview[];
  /** Registration.id of the captain who owns this session. */
  ownCaptainId: string | null;
  teamBudget: number;
};

type PickableRegistration = RegistrationRef & { isPicked?: boolean };

export function CaptainDashboard({
  initialSnapshot,
  pool,
  virtualTeams,
  ownCaptainId,
  teamBudget,
}: Props) {
  const { snapshot, prevSnapshot, connected } = useDraftStream(initialSnapshot);
  const [pickTarget, setPickTarget] = useState<RegistrationRef | null>(null);
  const [pickInitialPosition, setPickInitialPosition] = useState<Position | undefined>(undefined);
  const [noticeKind, setNoticeKind] = useState<CaptainNoticeKind | null>(null);
  const [rearrangingSlots, setRearrangingSlots] = useState(false);

  const session = snapshot?.session ?? null;
  const running = session?.status === 'IN_PROGRESS';
  const finished = session?.status === 'FINISHED';
  const onTheClockId = session?.onTheClock ?? null;
  const isMyTurn = running && onTheClockId !== null && onTheClockId === ownCaptainId;

  const liveTeams: TeamPreview[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.teams.map((t) => ({
      captainId: t.captainId,
      captainGameId: t.captainGameId,
      captainNickname: t.captainNickname,
      budgetLeft: t.budgetLeft,
      slots: t.slots.map((s) => ({
        position: s.position,
        player: s.registration as RegistrationRef | null,
      })),
    }));
  }, [snapshot]);

  const ownLiveTeam = useMemo(
    () => snapshot?.teams.find((t) => t.captainId === ownCaptainId) ?? null,
    [snapshot, ownCaptainId],
  );

  const teamsToRender = running || finished ? liveTeams : virtualTeams;
  const pickedSet = useMemo(
    () => new Set(snapshot?.pickedRegistrationIds ?? []),
    [snapshot?.pickedRegistrationIds],
  );
  const decoratedPool = useMemo(
    () => pool.map((p) => ({ ...p, isPicked: pickedSet.has(p.id) })),
    [pool, pickedSet],
  );

  const myEmptySlots = useMemo(
    () => ownLiveTeam?.slots.filter((s) => s.registration === null).map((s) => s.position) ?? [],
    [ownLiveTeam],
  );
  const myBudget = ownLiveTeam?.budgetLeft ?? 0;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function canPickPlayer(player: PickableRegistration) {
    return (
      isMyTurn &&
      !player.isPicked &&
      normalizeCost(player.cost) <= normalizeCost(myBudget) &&
      myEmptySlots.length > 0
    );
  }

  useEffect(() => {
    if (!snapshot || !ownCaptainId) return;
    const prevStatus = prevSnapshot?.session?.status ?? null;
    const curStatus = snapshot.session?.status ?? null;
    const prevOnClock = prevSnapshot?.session?.onTheClock ?? null;
    const curOnClock = snapshot.session?.onTheClock ?? null;

    const draftJustStarted =
      prevSnapshot !== null && prevStatus !== 'IN_PROGRESS' && curStatus === 'IN_PROGRESS';
    const justOnClock = prevOnClock !== ownCaptainId && curOnClock === ownCaptainId;

    if (draftJustStarted && justOnClock) setNoticeKind('started-and-turn');
    else if (draftJustStarted) setNoticeKind('started');
    else if (justOnClock) setNoticeKind('turn');
  }, [snapshot, prevSnapshot, ownCaptainId]);

  const onTheClockNick = onTheClockId
    ? snapshot?.teams.find((t) => t.captainId === onTheClockId)?.captainNickname ?? onTheClockId
    : null;

  async function persistOwnSlotSwap(from: Position, to: Position) {
    if (!ownLiveTeam || from === to) return;
    const fromIdx = ownLiveTeam.slots.findIndex((s) => s.position === from);
    const toIdx = ownLiveTeam.slots.findIndex((s) => s.position === to);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = ownLiveTeam.slots.map((s) => ({ ...s }));
    const fromRegistration = next[fromIdx].registration;
    const toRegistration = next[toIdx].registration;
    next[fromIdx] = { ...next[fromIdx], registration: toRegistration };
    next[toIdx] = { ...next[toIdx], registration: fromRegistration };

    setRearrangingSlots(true);
    const res = await fetch(`/api/draft/team/${ownLiveTeam.id}/slots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slots: next.map((s) => ({ position: s.position, registrationId: s.registration?.id ?? null })),
      }),
    });
    setRearrangingSlots(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '调整失败');
      return;
    }
    toast.success('已调整位置');
  }

  function handleDragEnd(event: DragEndEvent) {
    const pickIntent = resolveDraftPickDrop(event.active.data.current, event.over?.data.current);
    if (pickIntent && isMyTurn && myEmptySlots.includes(pickIntent.position)) {
      const player = decoratedPool.find((p) => p.id === pickIntent.playerId);
      if (
        player &&
        !player.isPicked &&
        normalizeCost(player.cost) <= normalizeCost(myBudget)
      ) {
        setPickTarget(player as RegistrationRef);
        setPickInitialPosition(pickIntent.position);
      }
      return;
    }

    const active = event.active.data.current as { type?: string; position?: Position } | undefined;
    const over = event.over?.data.current as { position?: Position } | undefined;
    if (active?.type === 'slot-player' && active.position && over?.position) {
      void persistOwnSlotSwap(active.position, over.position);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        className="flex h-full min-h-0 flex-col gap-3"
        style={{ background: 'rgb(var(--panel))' }}
      >
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Status accent bar */}
            <div
              className="w-[3px] h-8 rounded-[var(--radius-nexus)]"
              style={{
                background: isMyTurn
                  ? 'rgb(var(--accent-n))'
                  : running
                  ? 'rgb(var(--good))'
                  : finished
                  ? 'rgb(var(--accent-n2))'
                  : 'rgb(var(--gold))',
              }}
            />
            <div>
              <div className="font-display font-bold text-[15px] tracking-wide text-nexus-ink">
                DRAFT{' '}
                <span className="text-nexus-faint">{'//'}</span>{' '}
                BAY
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-nexus-faint mt-0.5">
                {!running && !finished && (
                  <>
                    NOT_STARTED · BUDGET{' '}
                    <span className="tabular-nums">{formatCost(teamBudget)}</span>{' '}
                    CR · <span className="tabular-nums">{teamsToRender.length}</span>{' '}
                    TEAMS
                  </>
                )}
                {running && (
                  <>
                    IN_PROGRESS · ROUND{' '}
                    <span className="tabular-nums">{session?.currentRound ?? 0}</span>{' '}
                    · <span className="tabular-nums">{snapshot?.pickedRegistrationIds.length ?? 0}</span>{' '}
                    PICKS
                  </>
                )}
                {finished && (
                  <>
                    FINISHED · <span className="tabular-nums">{snapshot?.pickedRegistrationIds.length ?? 0}</span>{' '}
                    PICKS
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <LiveDot />
            ) : (
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: 'rgb(var(--gold))' }}
              />
            )}
            <Kicker>{connected ? 'SSE_CONNECTED' : 'RECONNECTING'}</Kicker>
          </div>
        </header>

        {/* Divider */}
        <div
          className="h-px w-full"
          style={{ background: 'rgb(var(--line) / 0.6)' }}
        />

        {/* ── Status banner ───────────────────────────────────────────────── */}
        {!running && !finished && (
          <StatusBanner variant="amber" label="SESSION_PENDING">
            选秀未开始 · 当前为只读视图，等待管理员开启选秀
          </StatusBanner>
        )}
        {running && (
          <StatusBanner
            variant={isMyTurn ? 'accent' : 'good'}
            label={isMyTurn ? 'PRIORITY_ALERT · ON_CLOCK' : 'SESSION_LIVE'}
            pulse={isMyTurn}
          >
            {isMyTurn ? (
              <>
                <strong className="text-nexus-ink">现在轮到你出手</strong>
                {' · '}第{' '}
                <span className="tabular-nums">{session?.currentRound ?? 0}</span>{' '}
                轮 · 剩余预算{' '}
                <span className="tabular-nums">{formatCost(myBudget)}</span>{' '}
                CR · <span className="tabular-nums">{myEmptySlots.length}</span>{' '}
                个空位
              </>
            ) : (
              <>
                选秀进行中 · 第{' '}
                <span className="tabular-nums">{session?.currentRound ?? 0}</span>{' '}
                轮
                {onTheClockNick && (
                  <> · 当前出手：<span className="text-nexus-ink">{onTheClockNick}</span></>
                )}
              </>
            )}
          </StatusBanner>
        )}
        {finished && (
          <StatusBanner variant="violet" label="SESSION_COMPLETE">
            选秀已完成 · 最终阵容如下，可拖动调整己方位置
          </StatusBanner>
        )}

        {/* ── Teams section ───────────────────────────────────────────────── */}
        <section>
          <Panel>
            <PanelHead
              title={
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">
                  TEAMS{' '}
                  <span className="tabular-nums" style={{ color: 'rgb(var(--dim))' }}>
                    · {teamsToRender.length}
                  </span>
                </span>
              }
            />
            <div className="p-3">
              {teamsToRender.length === 0 ? (
                <div
                  className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.2em] rounded-[var(--radius-nexus)] border border-dashed"
                  style={{
                    color: 'rgb(var(--faint))',
                    borderColor: 'rgb(var(--line))',
                    background: 'rgb(var(--panel-2))',
                  }}
                >
                  暂无战队
                </div>
              ) : (
                <div
                  className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
                >
                  {teamsToRender.map((t) => {
                    const isOwn = t.captainId === ownCaptainId;
                    if (isOwn && ownLiveTeam) {
                      return (
                        <DraggableTeamBoard
                          key={ownLiveTeam.id}
                          team={{
                            id: ownLiveTeam.id,
                            captainId: ownLiveTeam.captainId,
                            captainGameId: ownLiveTeam.captainGameId,
                            captainNickname: ownLiveTeam.captainNickname,
                            budgetLeft: ownLiveTeam.budgetLeft,
                            slots: ownLiveTeam.slots.map((s) => ({
                              position: s.position,
                              player: s.registration as RegistrationRef | null,
                            })),
                          }}
                          seq={snapshot?.seq ?? 0}
                          pickDropEnabled={isMyTurn}
                          dndMode="external"
                        />
                      );
                    }
                    return <TeamPanel key={t.captainId} team={t} isOwn={isOwn} />;
                  })}
                </div>
              )}
            </div>
          </Panel>
        </section>

        {/* ── Pool section ────────────────────────────────────────────────── */}
        <section>
          <Panel>
            <PanelHead
              title={
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">
                  POOL{' '}
                  <span className="tabular-nums" style={{ color: 'rgb(var(--dim))' }}>
                    · {decoratedPool.length} CANDIDATES
                  </span>
                </span>
              }
              actions={isMyTurn ? <Chip variant="hot">ON CLOCK</Chip> : null}
            />
            <div className="p-3">
              <PlayerPool
                players={decoratedPool}
                getDragData={
                  isMyTurn
                    ? (p) => {
                        if (!canPickPlayer(p)) return null;
                        return { type: 'pool-player', playerId: p.id };
                      }
                    : undefined
                }
                onPickRequest={
                  isMyTurn
                    ? (p) => {
                        const player = p as PickableRegistration;
                        if (!canPickPlayer(player)) return;
                        setPickTarget(player);
                        setPickInitialPosition(undefined);
                      }
                    : undefined
                }
              />
            </div>
          </Panel>
        </section>

        {pickTarget && snapshot && (
          <PickAction
            open
            onOpenChange={(o) => {
              if (!o) {
                setPickTarget(null);
                setPickInitialPosition(undefined);
              }
            }}
            onPicked={() => {
              setPickTarget(null);
              setPickInitialPosition(undefined);
            }}
            player={pickTarget}
            emptySlots={myEmptySlots}
            budgetLeft={myBudget}
            expectedSeq={snapshot.seq}
            initialPosition={pickInitialPosition}
          />
        )}

        {noticeKind && !pickTarget && (
          <CaptainNotificationDialog
            kind={noticeKind}
            currentRound={session?.currentRound}
            budgetLeft={myBudget}
            emptySlots={myEmptySlots.length}
            onConfirm={() => setNoticeKind(null)}
          />
        )}

        {rearrangingSlots && (
          <span className="sr-only" role="status">正在调整位置</span>
        )}
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// StatusBanner — NEXUS-styled status banner replacing the old shadcn Banner
// ---------------------------------------------------------------------------

function StatusBanner({
  variant,
  label,
  pulse,
  children,
}: {
  variant: 'accent' | 'good' | 'violet' | 'amber';
  label: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  const cssVar: Record<string, string> = {
    accent: '--accent-n',
    good:   '--good',
    violet: '--accent-n2',
    amber:  '--gold',
  };
  const v = cssVar[variant];

  return (
    <div
      className={cn(
        'relative px-3.5 py-2.5 rounded-[var(--radius-nexus)]',
        pulse && 'motion-safe:animate-pulse',
      )}
      style={{
        borderLeft: `3px solid rgb(var(${v}) / 0.8)`,
        background: `rgb(var(${v}) / 0.06)`,
      }}
    >
      <div
        className="font-mono text-[9px] font-semibold tracking-[0.2em] uppercase mb-0.5"
        style={{ color: `rgb(var(${v}))` }}
      >
        ▸ {label}
      </div>
      <div className="font-mono text-[11px] text-nexus-dim leading-relaxed">
        {children}
      </div>
    </div>
  );
}
