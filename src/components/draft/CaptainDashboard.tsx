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
      <div className="flex h-full min-h-0 flex-col gap-3 bg-transparent">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-1 h-8 rounded-sm',
              isMyTurn
                ? 'bg-primary'
                : running
                ? 'bg-green-500'
                : finished
                ? 'bg-violet-500'
                : 'bg-amber-500',
            )}
          />
          <div>
            <div className="text-lg font-bold tracking-wide text-foreground">
              DRAFT <span className="text-muted-foreground">{'//'}</span> BAY
            </div>
            <div className="text-xs text-muted-foreground">
              {!running && !finished && (
                <>STATUS NOT_STARTED · BUDGET {formatCost(teamBudget)} CR · {teamsToRender.length} TEAMS</>
              )}
              {running && (
                <>
                  STATUS IN_PROGRESS · ROUND {session?.currentRound ?? 0} · {snapshot?.pickedRegistrationIds.length ?? 0} PICKS
                </>
              )}
              {finished && <>STATUS FINISHED · {snapshot?.pickedRegistrationIds.length ?? 0} PICKS</>}
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
          <span className={connected ? 'text-green-500' : 'text-amber-500'}>●</span>
          {connected ? 'SSE_CONNECTED' : 'RECONNECTING'}
        </span>
      </header>

      <div className="border-t" />

      {!running && !finished && (
        <Banner variant="amber" label="SESSION_PENDING">
          选秀未开始 · 当前为只读视图，等待管理员开启选秀
        </Banner>
      )}
      {running && (
        <Banner
          variant={isMyTurn ? 'primary' : 'green'}
          label={isMyTurn ? 'PRIORITY_ALERT · ON_CLOCK' : 'SESSION_LIVE'}
          pulse={isMyTurn}
        >
          {isMyTurn ? (
            <>
              <strong>现在轮到你出手</strong> · 第 {session?.currentRound ?? 0} 轮 · 剩余预算 {formatCost(myBudget)} CR · {myEmptySlots.length} 个空位
            </>
          ) : (
            <>
              选秀进行中 · 第 {session?.currentRound ?? 0} 轮
              {onTheClockNick && <> · 当前出手：{onTheClockNick}</>}
            </>
          )}
        </Banner>
      )}
      {finished && (
        <Banner variant="violet" label="SESSION_COMPLETE">
          选秀已完成 · 最终阵容如下，可拖动调整己方位置
        </Banner>
      )}

      <section>
        <div className="text-xs font-semibold text-foreground mb-2">▸ TEAMS</div>
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {teamsToRender.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-cyan-200/24 py-6 text-center text-xs text-muted-foreground">
              暂无战队
            </div>
          ) : (
            teamsToRender.map((t) => {
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
            })
          )}
        </div>
      </section>

      <section>
        <div className="text-xs font-semibold text-foreground mb-2">
          ▸ POOL · {decoratedPool.length} CANDIDATES
        </div>
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

function Banner({
  variant,
  label,
  pulse,
  children,
}: {
  variant: 'primary' | 'green' | 'violet' | 'amber';
  label: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  const borderStyles: Record<string, string> = {
    primary: 'border-l-primary bg-primary/5',
    green: 'border-l-green-500 bg-green-500/5',
    violet: 'border-l-violet-500 bg-violet-500/5',
    amber: 'border-l-amber-500 bg-amber-500/5',
  };
  const labelStyles: Record<string, string> = {
    primary: 'text-cyan-200',
    green: 'text-emerald-300',
    violet: 'text-fuchsia-300',
    amber: 'text-amber-200',
  };

  return (
    <div
      className={cn(
        'relative rounded-sm border border-cyan-200/10 px-3.5 py-2.5 border-l-[3px]',
        borderStyles[variant],
        pulse && 'animate-pulse',
      )}
    >
      <div className={cn('text-[9px] font-semibold tracking-widest uppercase mb-0.5', labelStyles[variant])}>
        ▸ {label}
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}
