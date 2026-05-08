'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Player } from '@prisma/client';
import type { DraftSnapshot } from '@/lib/draft/types';
import { useDraftStream } from '@/hooks/useDraftStream';
import { TcBar } from '@/components/tactical/TcBar';
import { PlayerPool } from '@/components/draft/PlayerPool';
import { TOTAL_ROUNDS } from '@/lib/draft/engine';
import { POSITION_LABEL } from '@/components/players/positions';
import { PlayerHoverCard } from '@/components/draft/PlayerHoverCard';
import { RoundConfigDialog } from './RoundConfigDialog';

type PoolPlayer = Pick<
  Player,
  'id' | 'gameId' | 'nickname' | 'cost' | 'primaryPositions' | 'secondaryPositions' | 'isCaptain' | 'isRetired'
>;

type Props = {
  initialSnapshot: DraftSnapshot;
  activeCaptainCount: number;
  teamBudget: number;
  pool: PoolPlayer[];
};

export function DraftControl({ initialSnapshot, activeCaptainCount, teamBudget, pool }: Props) {
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
    () => new Set(snapshot?.pickedPlayerIds ?? []),
    [snapshot?.pickedPlayerIds],
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
  const playerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of snapshot?.teams ?? []) {
      for (const slot of t.slots) {
        if (slot.player) m.set(slot.player.id, slot.player.nickname);
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

  const accent = running ? 'var(--tc-cyan)' : finished ? 'var(--tc-green)' : 'var(--tc-amber)';
  const onTheClockName = onTheClockId
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
              DRAFT<span style={{ color: accent }}>{'//'}</span>CONSOLE
            </div>
            <div className="tc-label">
              STATUS {status} · ROUND {currentRound}/{TOTAL_ROUNDS} · {snapshot?.teams.length ?? 0} TEAMS · {pool.length} POOL
              {onTheClockName && <> · ON CLOCK {onTheClockName.toUpperCase()}</>}
            </div>
          </div>
        </div>
        <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
          <span style={{ color: connected ? 'var(--tc-green)' : 'var(--tc-amber)' }}>●</span>{' '}
          {connected ? 'SSE_CONNECTED' : 'RECONNECTING'}
        </span>
      </header>

      <div className="tc-divider" />

      <div
        className="tc-card"
        style={{ padding: 14, position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
      >
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

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
            <a href="/api/draft/export?format=csv" download className="tc-btn">↓ EXPORT CSV</a>
            <a href="/api/draft/export?format=json" download className="tc-btn">↓ EXPORT JSON</a>
            <button onClick={() => setResetConfirm(true)} disabled={acting !== null} className="tc-btn tc-btn-danger">
              ⨯ ABORT & RESET
            </button>
          </>
        )}

        <span style={{ marginLeft: 'auto' }} className="tc-mono">
          {!running && !finished && (
            <span style={{ color: 'var(--tc-text-dim)', fontSize: 11 }}>
              {activeCaptainCount} captains ready · budget {teamBudget} CR
            </span>
          )}
          {running && (
            <span style={{ color: 'var(--tc-text-dim)', fontSize: 11 }}>
              {snapshot?.pickedPlayerIds.length ?? 0} picks · {snapshot?.teams.length ?? 0} teams
            </span>
          )}
          {finished && (
            <span style={{ color: 'var(--tc-green)', fontSize: 11 }}>
              ✓ DRAFT COMPLETE · {snapshot?.pickedPlayerIds.length ?? 0} picks
            </span>
          )}
        </span>
      </div>

      {(running || finished) && snapshot && snapshot.teams.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr', gap: 12 }}>
          <div className="tc-card" style={{ padding: 14, position: 'relative' }}>
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
            <div className="tc-h3" style={{ marginBottom: 10 }}>
              ▸ TEAMS · LIVE · {snapshot.teams.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {snapshot.teams.map((t) => {
                const isOnClock = onTheClockId === t.captainId;
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '10px 12px',
                      border: `1px solid ${isOnClock ? 'var(--tc-cyan)' : 'var(--tc-line)'}`,
                      background: isOnClock ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
                      boxShadow: isOnClock ? 'inset 0 0 14px rgba(0,229,255,0.18)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span
                        className="tc-display"
                        style={{ fontSize: 14, color: isOnClock ? 'var(--tc-cyan)' : 'var(--tc-text)' }}
                      >
                        {t.captainNickname}
                      </span>
                      <span className="tc-num" style={{ fontSize: 13, color: 'var(--tc-amber)' }}>
                        {t.budgetLeft}
                        <span className="tc-mono" style={{ fontSize: 9, marginLeft: 2 }}>CR</span>
                      </span>
                    </div>
                    <div className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)', marginTop: 2 }}>
                      @{t.captainGameId} · {t.slots.filter((s) => s.player).length}/5 filled
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <TcBar pct={t.budgetLeft / Math.max(1, teamBudget)} w="100%" color="var(--tc-amber)" />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {t.slots.map((slot) => {
                        const row = (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '46px 1fr auto',
                              gap: 6,
                              alignItems: 'center',
                              padding: '3px 6px',
                              background: slot.player ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
                              border: '1px solid var(--tc-line)',
                              fontSize: 11,
                            }}
                          >
                            <span className="tc-label" style={{ fontSize: 9 }}>
                              {POSITION_LABEL[slot.position]}
                            </span>
                            {slot.player ? (
                              <span
                                style={{
                                  minWidth: 0,
                                  fontFamily: 'var(--tc-font-display)',
                                  color: slot.player.id === t.captainId ? 'var(--tc-cyan)' : 'var(--tc-text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {slot.player.nickname}
                                {slot.player.id === t.captainId && (
                                  <span
                                    className="tc-mono"
                                    style={{ marginLeft: 4, fontSize: 9, color: 'var(--tc-cyan)' }}
                                  >
                                    ◆ C
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
                                — empty —
                              </span>
                            )}
                            <span
                              className="tc-num"
                              style={{
                                fontSize: 11,
                                color: slot.player ? 'var(--tc-amber)' : 'var(--tc-text-faint)',
                              }}
                            >
                              {slot.player ? slot.player.cost : '—'}
                            </span>
                          </div>
                        );
                        return slot.player ? (
                          <PlayerHoverCard key={slot.position} player={slot.player}>
                            {row}
                          </PlayerHoverCard>
                        ) : (
                          <div key={slot.position}>{row}</div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tc-card" style={{ padding: 14, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
            <div className="tc-h3" style={{ marginBottom: 10 }}>
              ▸ PICKS HISTORY · {snapshot.picks.length}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 600 }}>
              {snapshot.picks.length === 0 ? (
                <div
                  className="tc-mono"
                  style={{ padding: 20, textAlign: 'center', color: 'var(--tc-text-faint)', fontSize: 11 }}
                >
                  无 pick · 等待第一手
                </div>
              ) : (
                [...snapshot.picks].reverse().map((pick) => {
                  const team = teamById.get(pick.teamId);
                  const playerName = playerNameById.get(pick.playerId) ?? pick.playerId;
                  return (
                    <div
                      key={pick.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '52px 1fr auto',
                        gap: 8,
                        padding: '6px 4px',
                        alignItems: 'center',
                        borderBottom: '1px dashed var(--tc-line)',
                        fontFamily: 'var(--tc-font-mono)',
                        fontSize: 11,
                      }}
                    >
                      <span className="tc-chip" style={{ fontSize: 9, padding: '1px 6px' }}>
                        R{pick.roundNo}.{pick.pickIndex + 1}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: 'var(--tc-cyan)' }}>{team?.captainNickname ?? '—'}</span>
                        <span style={{ color: 'var(--tc-text-faint)' }}> → </span>
                        <span style={{ color: 'var(--tc-text)' }}>{playerName}</span>
                        <span style={{ color: 'var(--tc-text-faint)', marginLeft: 6 }}>
                          {POSITION_LABEL[pick.position]} · {pick.costPaid}
                        </span>
                      </span>
                      <button
                        onClick={() => revokePickAction(pick.id)}
                        disabled={revokingPickId !== null}
                        className="tc-btn"
                        style={{ padding: '1px 6px', fontSize: 9 }}
                      >
                        {revokingPickId === pick.id ? '…' : '⟲ REVOKE'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="tc-card" style={{ padding: 18, position: 'relative' }}>
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <div className="tc-h3" style={{ marginBottom: 10 }}>▸ READY</div>
          <p className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-text-dim)' }}>
            启动后将创建 {activeCaptainCount} 支战队，每位队长按主位入位，预算 {teamBudget} CR - 队长费用。名册与配置自动锁定。
          </p>
        </div>
      )}

      <section>
        <div className="tc-h3" style={{ marginBottom: 8 }}>
          ▸ POOL · {decoratedPool.length} CANDIDATES
          {(running || finished) && (
            <span className="tc-mono" style={{ marginLeft: 8, fontSize: 10, color: 'var(--tc-text-faint)' }}>
              {snapshot?.pickedPlayerIds.length ?? 0} picked · {pool.length - (snapshot?.pickedPlayerIds.length ?? 0)} available
            </span>
          )}
        </div>
        <PlayerPool players={decoratedPool} />
      </section>

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
    </div>
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
