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

  const accent = isMyTurn
    ? 'var(--tc-cyan)'
    : running
    ? 'var(--tc-green)'
    : finished
    ? 'var(--tc-purple)'
    : 'var(--tc-amber)';
  const onTheClockNick = onTheClockId
    ? snapshot?.teams.find((t) => t.captainId === onTheClockId)?.captainNickname ?? onTheClockId
    : null;

  return (
    <div
      className="tc-board"
      style={{ minHeight: '100%', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              DRAFT<span style={{ color: accent }}>{'//'}</span>BAY
            </div>
            <div className="tc-label">
              {!running && !finished && <>STATUS NOT_STARTED · BUDGET {teamBudget} CR · {teamsToRender.length} TEAMS</>}
              {running && (
                <>
                  STATUS IN_PROGRESS · ROUND {session?.currentRound ?? 0} · {snapshot?.pickedRegistrationIds.length ?? 0} PICKS
                </>
              )}
              {finished && <>STATUS FINISHED · {snapshot?.pickedRegistrationIds.length ?? 0} PICKS</>}
            </div>
          </div>
        </div>
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
          <span style={{ color: connected ? 'var(--tc-green)' : 'var(--tc-amber)' }}>●</span>{' '}
          {connected ? 'SSE_CONNECTED' : 'RECONNECTING'}
        </span>
      </header>

      <div className="tc-divider" />

      {!running && !finished && (
        <Banner accent="var(--tc-amber)" label="SESSION_PENDING">
          选秀未开始 · 当前为只读视图，等待管理员开启选秀
        </Banner>
      )}
      {running && (
        <Banner
          accent={accent}
          label={isMyTurn ? 'PRIORITY_ALERT · ON_CLOCK' : 'SESSION_LIVE'}
          pulse={isMyTurn}
        >
          {isMyTurn ? (
            <>
              🎯 <strong>现在轮到你出手</strong> · 第 {session?.currentRound ?? 0} 轮 · 剩余预算 {myBudget} CR · {myEmptySlots.length} 个空位
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
        <Banner accent="var(--tc-purple)" label="SESSION_COMPLETE">
          ✓ 选秀已完成 · 最终阵容如下，可拖动调整己方位置
        </Banner>
      )}

      <section>
        <div className="tc-h3" style={{ marginBottom: 8 }}>▸ TEAMS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {teamsToRender.length === 0 ? (
            <div
              className="tc-mono"
              style={{
                gridColumn: '1 / -1',
                padding: 24,
                textAlign: 'center',
                color: 'var(--tc-text-faint)',
                fontSize: 11,
                border: '1px dashed var(--tc-line2)',
              }}
            >
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
        <div className="tc-h3" style={{ marginBottom: 8 }}>▸ POOL · {decoratedPool.length} CANDIDATES</div>
        <PlayerPool
          players={decoratedPool}
          renderActions={
            isMyTurn
              ? (p) => (
                  <button
                    onClick={() => setPickTarget(p as RegistrationRef)}
                    disabled={p.isPicked || p.cost > myBudget || myEmptySlots.length === 0}
                    className="tc-btn tc-btn-primary"
                    style={{
                      padding: '4px 10px',
                      fontSize: 10,
                      opacity: p.isPicked || p.cost > myBudget || myEmptySlots.length === 0 ? 0.4 : 1,
                    }}
                  >
                    ▸ PICK
                  </button>
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
  accent,
  label,
  pulse,
  children,
}: {
  accent: string;
  label: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        padding: '10px 14px',
        background: `${accent}10`,
        borderLeft: `3px solid ${accent}`,
        animation: pulse ? 'tc-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    >
      <div className="tc-label" style={{ color: accent, fontSize: 9 }}>
        ▸ {label}
      </div>
      <div className="tc-mono" style={{ fontSize: 12, color: 'var(--tc-text-dim)', marginTop: 3, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}
