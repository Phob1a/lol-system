'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { formatCost, normalizeCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

type Props = {
  initialSnapshot: DraftSnapshot;
  pool: RegistrationRef[];
  virtualTeams: TeamPreview[];
  /** Registration.id of the captain who owns this session. */
  ownCaptainId: string | null;
  teamBudget: number;
};

export function CaptainDashboard({
  initialSnapshot,
  pool,
  virtualTeams,
  ownCaptainId,
  teamBudget,
}: Props) {
  const { snapshot, prevSnapshot, connected } = useDraftStream(initialSnapshot);
  const [pickTarget, setPickTarget] = useState<RegistrationRef | null>(null);
  const [noticeKind, setNoticeKind] = useState<CaptainNoticeKind | null>(null);

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-background">
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
              🎯 <strong>现在轮到你出手</strong> · 第 {session?.currentRound ?? 0} 轮 · 剩余预算 {formatCost(myBudget)} CR · {myEmptySlots.length} 个空位
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
          ✓ 选秀已完成 · 最终阵容如下，可拖动调整己方位置
        </Banner>
      )}

      <section>
        <div className="text-xs font-semibold text-foreground mb-2">▸ TEAMS</div>
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {teamsToRender.length === 0 ? (
            <div className="col-span-full py-6 text-center text-xs text-muted-foreground border border-dashed rounded-md">
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
          renderActions={
            isMyTurn
              ? (p) => (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setPickTarget(p as RegistrationRef)}
                    disabled={p.isPicked || normalizeCost(p.cost) > normalizeCost(myBudget) || myEmptySlots.length === 0}
                    className="text-xs px-2.5 py-1 h-auto"
                  >
                    ▸ PICK
                  </Button>
                )
              : undefined
          }
        />
      </section>

      {pickTarget && snapshot && (
        <PickAction
          open
          onOpenChange={(o) => !o && setPickTarget(null)}
          onPicked={() => setPickTarget(null)}
          player={pickTarget}
          emptySlots={myEmptySlots}
          budgetLeft={myBudget}
          expectedSeq={snapshot.seq}
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
    </div>
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
    primary: 'text-primary',
    green: 'text-green-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
  };

  return (
    <div
      className={cn(
        'relative px-3.5 py-2.5 border-l-[3px] rounded-sm',
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
