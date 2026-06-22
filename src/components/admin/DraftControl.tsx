'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Tournament, Position } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import { useDraftStream } from '@/hooks/useDraftStream';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { TOTAL_ROUNDS } from '@/lib/draft/engine';
import { POSITION_LABEL } from '@/components/players/positions';
import { BroadcastLayout } from '@/components/draft/BroadcastLayout';
import { OnTheClockHero, type HeroStatus } from '@/components/draft/OnTheClockHero';
import { TeamGrid } from '@/components/draft/TeamGrid';
import { EventStream } from '@/components/draft/EventStream';
import { RoundConfigDialog } from './RoundConfigDialog';
import Panel from '@/components/nexus/Panel';
import Chip from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import LiveDot from '@/components/nexus/LiveDot';
import NexusButton from '@/components/nexus/NexusButton';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { formatCost } from '@/lib/costs';
import { cn } from '@/lib/utils';

type PoolPlayer = {
  id: string;
  gameId: string;
  nickname: string;
  cost: number;
  primaryPositions: Position[];
  secondaryPositions: Position[];
  availability: string;
};

type Props = {
  tournament: Tournament;
  initialSnapshot: DraftSnapshot;
  activeCaptainCount: number;
  teamBudget: number;
  pool: PoolPlayer[];
};

export function DraftControl({ tournament, initialSnapshot, activeCaptainCount, teamBudget, pool }: Props) {
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

  const heroProps: HeroStatus = useMemo(() => {
    if (!session || status === 'NOT_STARTED') return { status: 'pending' };
    if (finished) {
      return {
        status: 'completed',
        teamCount: snapshot?.teams.length ?? 0,
        totalPicks: snapshot?.picks.length ?? 0,
      };
    }
    if (running && onTheClockTeam) {
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
    // IN_PROGRESS but nobody on the clock = between rounds.
    return { status: 'waiting', round: currentRound, totalRounds: TOTAL_ROUNDS };
  }, [session, status, finished, running, onTheClockTeam, currentRound, snapshot?.teams.length, snapshot?.picks.length]);

  // Build EventStream events from non-revoked picks (most recent first)
  const streamEvents = useMemo(() => {
    const picks = snapshot?.picks ?? [];
    return [...picks].reverse().map((pick) => {
      const team = teamById.get(pick.teamId);
      const regName = registrationNameById.get(pick.registrationId) ?? pick.registrationId;
      const label = `「${team?.captainNickname ?? '—'}」选中 ${regName} · ${POSITION_LABEL[pick.position]} · ${formatCost(pick.costPaid)}`;
      return { id: pick.id, label };
    });
  }, [snapshot?.picks, teamById, registrationNameById]);

  // Controls slot — all existing draft operation controls
  const exportLinkClass =
    'inline-flex h-9 items-center justify-center gap-[7px] rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-[15px] font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-nexus-ink transition-colors hover:border-nexus-accent/65 hover:text-nexus-accent';
  const controlsNode = (
    <Panel className="flex flex-wrap items-center gap-2 p-4">
      <div className="mr-1 flex items-center gap-2">
        <Chip variant={connected ? 'good' : 'default'}>
          {connected ? (
            <>
              <LiveDot />
              LIVE
            </>
          ) : (
            'RECONNECTING'
          )}
        </Chip>
        <Chip variant="ac">
          R{currentRound}/{TOTAL_ROUNDS}
        </Chip>
      </div>

      {!running && !finished && (
        <NexusButton
          variant="primary"
          onClick={startDraftAction}
          disabled={acting !== null || activeCaptainCount === 0}
        >
          <LoadingButtonContent loading={acting === 'start'} loadingText="开始中…">
            开始选秀
          </LoadingButtonContent>
        </NexusButton>
      )}
      {canStartNextRound && (
        <NexusButton variant="primary" onClick={() => setRoundDialogOpen(true)}>
          ▸ 开始第 {nextRoundNo} 轮
        </NexusButton>
      )}
      {canRewind && (
        <NexusButton onClick={() => setRewindConfirm(true)} disabled={acting !== null}>
          <LoadingButtonContent loading={acting === 'rewind'} loadingText="回退中…">
            回退轮次
          </LoadingButtonContent>
        </NexusButton>
      )}
      {(running || finished) && (
        <>
          <a href="/api/draft/export?format=csv" download className={exportLinkClass}>
            ↓ CSV
          </a>
          <a href="/api/draft/export?format=json" download className={exportLinkClass}>
            ↓ JSON
          </a>
          <NexusButton
            onClick={() => setResetConfirm(true)}
            disabled={acting !== null}
            className="border-nexus-bad/50 text-nexus-bad hover:border-nexus-bad hover:text-nexus-bad"
          >
            <LoadingButtonContent loading={acting === 'reset'} loadingText="重置中…">
              重置
            </LoadingButtonContent>
          </NexusButton>
        </>
      )}

      <Readout className="ml-auto text-[11px] text-nexus-faint">
        {!running && !finished && (
          <span>
            {activeCaptainCount} captains · {formatCost(teamBudget)} CR
          </span>
        )}
        {running && (
          <span>
            {snapshot?.pickedRegistrationIds.length ?? 0} picks · {snapshot?.teams.length ?? 0} teams
          </span>
        )}
        {finished && (
          <span className="text-nexus-accent">
            ✓ COMPLETE · {snapshot?.pickedRegistrationIds.length ?? 0} picks
          </span>
        )}
      </Readout>
    </Panel>
  );

  return (
    <>
      <BroadcastLayout
        defaultMobileTab="grid"
        controls={controlsNode}
        hero={<OnTheClockHero {...heroProps} />}
        grid={
          <TeamGrid
            teams={snapshot?.teams ?? []}
            onTheClockId={onTheClockId}
            maxBudget={tournament.teamBudget}
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
          title="⨯ 重置选秀"
          message="将清空所有战队、已选记录与事件日志，并解锁名册与配置。该操作无法撤销。"
          confirmLabel="⨯ 确认重置"
          danger
          onConfirm={resetDraftAction}
          onCancel={() => setResetConfirm(false)}
        />
      )}
      {rewindConfirm && (
        <ConfirmModal
          title="⟲ 回退轮次"
          message={`将撤销第 ${currentRound} 轮的所有 pick，恢复预算与位置，并将 currentRound 设为 ${currentRound - 1}。`}
          confirmLabel="⟲ 确认回退"
          onConfirm={rewindRoundAction}
          onCancel={() => setRewindConfirm(false)}
        />
      )}
    </>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-nexus-bg/80 backdrop-blur-md"
    >
      <Panel
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-[calc(100vw_-_2rem)] max-w-[440px] p-4 shadow-lg sm:p-6',
          danger && 'border-nexus-bad/40',
        )}
      >
        <div className={cn('mb-2 font-display text-lg', danger ? 'text-nexus-bad' : 'text-nexus-ink')}>
          {title}
        </div>
        <div className="mb-4 text-sm text-nexus-dim">{message}</div>
        <div className="flex justify-end gap-2">
          <NexusButton onClick={onCancel}>取消</NexusButton>
          <NexusButton
            variant={danger ? 'default' : 'primary'}
            onClick={onConfirm}
            className={danger ? 'border-nexus-bad/50 text-nexus-bad hover:border-nexus-bad hover:text-nexus-bad' : undefined}
          >
            {confirmLabel}
          </NexusButton>
        </div>
      </Panel>
    </div>
  );
}
