'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Season, Position } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import { useDraftStream } from '@/hooks/useDraftStream';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { TOTAL_ROUNDS } from '@/lib/draft/engine';
import { POSITION_LABEL } from '@/components/players/positions';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero } from '@/components/draft/OnTheClockHero';
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { RoundConfigDialog } from './RoundConfigDialog';

type PoolPlayer = {
  id: string;
  gameId: string;
  nickname: string;
  cost: number;
  primaryPositions: Position[];
  secondaryPositions: Position[];
};

type Props = {
  season: Season;
  initialSnapshot: DraftSnapshot;
  activeCaptainCount: number;
  teamBudget: number;
  pool: PoolPlayer[];
};

export function DraftControl({ season, initialSnapshot, activeCaptainCount, teamBudget, pool }: Props) {
  const { snapshot, connected, reload } = useDraftStream(initialSnapshot);
  const [acting, setActing] = useState<'start' | 'reset' | 'rewind' | null>(null);
  const [revokingPickId, setRevokingPickId] = useState<string | null>(null);
  const [roundDialogOpen, setRoundDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [rewindConfirm, setRewindConfirm] = useState(false);

  const session = snapshot?.session ?? null;
  const status = session?.status ?? 'NOT_STARTED';
  const running = status === 'IN_PROGRESS';
  const finished = status === 'FINISHED';

  const pickedSet = useMemo(
    () => new Set(snapshot?.pickedRegistrationIds ?? []),
    [snapshot?.pickedRegistrationIds],
  );
  const decoratedPool = useMemo(
    () => pool.map((p) => ({ ...p, isPicked: pickedSet.has(p.id) })),
    [pool, pickedSet],
  );
  const unpickedPool = useMemo(
    () => pool.filter((p) => !pickedSet.has(p.id)),
    [pool, pickedSet],
  );

  const onTheClockId = session?.onTheClock ?? null;
  const currentRound = session?.currentRound ?? 0;
  const nextRoundNo = currentRound + 1;
  const canStartNextRound = running && onTheClockId === null && currentRound < TOTAL_ROUNDS;
  const canReverse = currentRound >= 1;
  const canRewind = (running || finished) && currentRound >= 1;

  const teamById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof snapshot>['teams'][number]>();
    for (const t of snapshot?.teams ?? []) m.set(t.id, t);
    return m;
  }, [snapshot]);
  const registrationNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of snapshot?.teams ?? []) {
      for (const slot of t.slots) {
        if (slot.registration) m.set(slot.registration.id, slot.registration.nickname);
      }
    }
    return m;
  }, [snapshot]);

  useEffect(() => {
    if (!canStartNextRound && roundDialogOpen) setRoundDialogOpen(false);
  }, [canStartNextRound, roundDialogOpen]);

  async function startDraftAction() {
    setActing('start');
    const res = await fetch('/api/draft/start', { method: 'POST' });
    setActing(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '启动失败');
      return;
    }
    toast.success('选秀已启动');
    void reload();
  }

  async function resetDraftAction() {
    setActing('reset');
    setResetConfirm(false);
    const res = await fetch('/api/draft/reset', { method: 'POST' });
    setActing(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '重置失败');
      return;
    }
    toast.success('选秀已重置');
    void reload();
  }

  async function rewindRoundAction() {
    setActing('rewind');
    setRewindConfirm(false);
    const res = await fetch('/api/draft/round/rewind', { method: 'POST' });
    setActing(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '回退失败');
      return;
    }
    toast.success('已回退一轮');
    void reload();
  }

  async function revokePickAction(pickId: string) {
    setRevokingPickId(pickId);
    const res = await fetch(`/api/draft/pick/${pickId}/revoke`, { method: 'POST' });
    setRevokingPickId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '撤销失败');
      return;
    }
    toast.success('已撤销');
    void reload();
  }

  // Derive on-the-clock team for hero
  const onTheClockTeam = onTheClockId
    ? (snapshot?.teams.find((t) => t.captainId === onTheClockId) ?? null)
    : null;
  const heroTeamName = onTheClockTeam?.captainNickname ?? null;
  const heroBudgetLeft = onTheClockTeam?.budgetLeft ?? null;
  const heroMissingPositions = onTheClockTeam
    ? onTheClockTeam.slots.filter((s) => s.registration === null).map((s) => s.position)
    : [];
  const heroPickedCount = onTheClockTeam
    ? onTheClockTeam.slots.filter((s) => s.registration !== null).length - 1 // exclude captain slot
    : 0;

  // Build EventStream events from non-revoked picks (most recent first)
  const streamEvents = useMemo(() => {
    const picks = snapshot?.picks ?? [];
    return [...picks].reverse().map((pick) => {
      const team = teamById.get(pick.teamId);
      const regName = registrationNameById.get(pick.registrationId) ?? pick.registrationId;
      const label = `「${team?.captainNickname ?? '—'}」选中 ${regName} · ${POSITION_LABEL[pick.position]} · ${pick.costPaid}`;
      return { id: pick.id, label };
    });
  }, [snapshot?.picks, teamById, registrationNameById]);

  // Controls slot — all existing draft operation controls
  const controlsNode = (
    <div
      className="tc-card"
      style={{ padding: 14, position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
    >
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
          <span style={{ color: connected ? 'var(--tc-green)' : 'var(--tc-amber)' }}>●</span>{' '}
          {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
        <span className="tc-label" style={{ fontSize: 10 }}>
          R{currentRound}/{TOTAL_ROUNDS}
        </span>
      </div>

      {!running && !finished && (
        <button
          onClick={startDraftAction}
          disabled={acting !== null || activeCaptainCount === 0}
          className="tc-btn tc-btn-primary"
        >
          ▸ {acting === 'start' ? 'STARTING…' : 'START DRAFT'}
        </button>
      )}
      {canStartNextRound && (
        <button onClick={() => setRoundDialogOpen(true)} className="tc-btn tc-btn-primary">
          ▸ START ROUND {nextRoundNo}
        </button>
      )}
      {canRewind && (
        <button onClick={() => setRewindConfirm(true)} disabled={acting !== null} className="tc-btn">
          {acting === 'rewind' ? '⟲ REWINDING…' : '⟲ REWIND ROUND'}
        </button>
      )}
      {(running || finished) && (
        <>
          <a href="/api/draft/export?format=csv" download className="tc-btn">↓ CSV</a>
          <a href="/api/draft/export?format=json" download className="tc-btn">↓ JSON</a>
          <button onClick={() => setResetConfirm(true)} disabled={acting !== null} className="tc-btn tc-btn-danger">
            ⨯ RESET
          </button>
        </>
      )}

      <span style={{ marginLeft: 'auto' }} className="tc-mono">
        {!running && !finished && (
          <span style={{ color: 'var(--tc-text-dim)', fontSize: 11 }}>
            {activeCaptainCount} captains · {teamBudget} CR
          </span>
        )}
        {running && (
          <span style={{ color: 'var(--tc-text-dim)', fontSize: 11 }}>
            {snapshot?.pickedRegistrationIds.length ?? 0} picks · {snapshot?.teams.length ?? 0} teams
          </span>
        )}
        {finished && (
          <span style={{ color: 'var(--tc-green)', fontSize: 11 }}>
            ✓ COMPLETE · {snapshot?.pickedRegistrationIds.length ?? 0} picks
          </span>
        )}
      </span>
    </div>
  );

  return (
    <>
      <BroadcastLayout
        controls={controlsNode}
        hero={
          <OnTheClockHero
            teamName={heroTeamName}
            round={currentRound}
            budgetLeft={heroBudgetLeft}
            missingPositions={heroMissingPositions}
            pickedCount={Math.max(0, heroPickedCount)}
            slotCount={5}
          />
        }
        grid={
          <TeamGrid
            teams={snapshot?.teams ?? []}
            onTheClockId={onTheClockId}
            maxBudget={season.teamBudget}
          />
        }
        pool={<PlayerPool players={decoratedPool} />}
        events={<EventStream events={streamEvents} />}
      />

      {snapshot && roundDialogOpen && (
        <RoundConfigDialog
          open={roundDialogOpen}
          onOpenChange={setRoundDialogOpen}
          onSubmitted={() => void reload()}
          snapshot={snapshot}
          pool={unpickedPool}
          canReverse={canReverse}
          nextRoundNo={nextRoundNo}
        />
      )}

      {resetConfirm && (
        <ConfirmModal
          accent="var(--tc-red)"
          title="⨯ RESET DRAFT"
          message="将清空所有战队、已选记录与事件日志，并解锁名册与配置。该操作无法撤销。"
          confirmLabel="⨯ CONFIRM RESET"
          danger
          onConfirm={resetDraftAction}
          onCancel={() => setResetConfirm(false)}
        />
      )}
      {rewindConfirm && (
        <ConfirmModal
          accent="var(--tc-amber)"
          title="⟲ REWIND ROUND"
          message={`将撤销第 ${currentRound} 轮的所有 pick，恢复预算与位置，并将 currentRound 设为 ${currentRound - 1}。`}
          confirmLabel="⟲ CONFIRM REWIND"
          onConfirm={rewindRoundAction}
          onCancel={() => setRewindConfirm(false)}
        />
      )}
    </>
  );
}

function ConfirmModal({
  accent,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  accent: string;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(7,8,12,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tc-card"
        style={{ width: 440, padding: 24, background: 'var(--tc-bg-1)', position: 'relative' }}
      >
        <span className="corner tl" style={{ borderColor: accent }} />
        <span className="corner tr" style={{ borderColor: accent }} />
        <span className="corner bl" style={{ borderColor: accent }} />
        <span className="corner br" style={{ borderColor: accent }} />
        <div className="tc-h2" style={{ color: accent, marginBottom: 8 }}>{title}</div>
        <div className="tc-mono" style={{ fontSize: 12, color: 'var(--tc-text-dim)', marginBottom: 16 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="tc-btn" onClick={onCancel}>CANCEL</button>
          <button className={`tc-btn ${danger ? 'tc-btn-danger' : 'tc-btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
