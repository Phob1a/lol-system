'use client';

/**
 * MatchDetail — slide-over drawer (screen 3.6).
 *
 * Renders a full match box score in a panel sliding in from the right.
 * Animation: translateX(100%) → 0 in 260ms cubic-bezier(.22,.61,.36,1).
 * Close: ESC key, backdrop click, or × button.
 *
 * Mount via MatchDetailProvider (src/components/tournament/MatchDetailProvider.tsx).
 * Data source: /api/tournament/public/match/[id]
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import ChampAvatar from '@/components/nexus/ChampAvatar';
import NexusButton from '@/components/nexus/NexusButton';

// ---------------------------------------------------------------------------
// Types (mirror /api/tournament/public/match/[id] → getPublicMatchDetail)
// ---------------------------------------------------------------------------

type Player = {
  registrationId: string;
  playerId: string | null;
  nickname: string;
  teamId: string;
  championId: string;
  championName: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  gold: number | null;
};

type Game = {
  id: string;
  index: number;
  blueTeamId: string | null;
  winnerTeamId: string | null;
  durationSeconds: number | null;
  mvpRegistrationId: string | null;
  bans: Array<{
    teamId: string;
    type: string;
    championId: string;
    championName: string | null;
    order: number;
  }>;
  players: Player[];
};

type MatchDetail = {
  id: string;
  label: string | null;
  roundKey: string | null;
  bestOf: number;
  status: string;
  scheduledAt: string | null;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  winnerTeamId: string | null;
  games: Game[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// CompareBar
// ---------------------------------------------------------------------------

interface CompareBarProps {
  label: string;
  a: number;
  b: number;
}

function CompareBar({ label, a, b }: CompareBarProps) {
  const total = Math.max(1, a + b);
  const ap = (a / total) * 100;
  const bp = 100 - ap;

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex justify-between items-baseline mb-[5px]">
        <Readout
          className="text-sm font-bold"
          style={{ color: a >= b ? 'rgb(var(--accent-n))' : 'rgb(var(--dim))' }}
        >
          {a}
        </Readout>
        <Kicker>{label}</Kicker>
        <Readout
          className="text-sm font-bold"
          style={{ color: b >= a ? 'rgb(var(--accent-n2))' : 'rgb(var(--dim))' }}
        >
          {b}
        </Readout>
      </div>
      <div className="flex h-[6px] gap-[2px]">
        <div
          style={{
            width: `${ap}%`,
            background: 'rgb(var(--accent-n))',
            borderRadius: '2px 0 0 2px',
            transition: 'width 0.4s ease',
          }}
        />
        <div
          style={{
            width: `${bp}%`,
            background: 'rgb(var(--accent-n2) / 0.65)',
            borderRadius: '0 2px 2px 0',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineupTable — per-game player rows for one side
// ---------------------------------------------------------------------------

interface LineupTableProps {
  players: Player[];
  mvpRegistrationId: string | null;
}

function LineupTable({ players, mvpRegistrationId }: LineupTableProps) {
  if (players.length === 0) {
    return (
      <p className="text-nexus-faint text-[12px] py-4 px-4 text-center font-mono">
        阵容数据未记录
      </p>
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {['选手', '英雄', 'K/D/A', '补刀', '输出 (k)'].map((h, i) => (
            <th
              key={i}
              className="font-mono text-[9px] tracking-[0.1em] uppercase text-nexus-faint font-semibold py-[7px] px-[8px] border-b border-nexus-line"
              style={{ textAlign: i > 1 ? 'center' : 'left' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const isMvp = p.registrationId === mvpRegistrationId;
          const champKey = p.championName ?? p.championId ?? '';
          return (
            <tr
              key={p.registrationId}
              style={{ background: isMvp ? 'rgb(var(--gold) / 0.08)' : 'transparent' }}
            >
              {/* nickname */}
              <td className="px-[8px] py-[8px] border-b border-nexus-line/35 whitespace-nowrap">
                <span className="text-[12.5px] font-body text-nexus-ink">{p.nickname}</span>
                {isMvp && (
                  <span className="text-[11px] ml-[5px]" style={{ color: 'rgb(var(--gold))' }}>
                    ★MVP
                  </span>
                )}
              </td>
              {/* champion */}
              <td className="px-[8px] py-[8px] border-b border-nexus-line/35">
                <span className="inline-flex items-center gap-[7px]">
                  {champKey ? (
                    <ChampAvatar champion={champKey} size={24} />
                  ) : null}
                  <Readout className="text-[12px] text-nexus-dim">
                    {p.championName ?? p.championId ?? '—'}
                  </Readout>
                </span>
              </td>
              {/* kda */}
              <td className="px-[8px] py-[8px] border-b border-nexus-line/35 text-center">
                <Readout className="text-[12px]">
                  {p.kills ?? '—'}/{p.deaths ?? '—'}/{p.assists ?? '—'}
                </Readout>
              </td>
              {/* cs */}
              <td className="px-[8px] py-[8px] border-b border-nexus-line/35 text-center">
                <Readout className="text-[12px] text-nexus-dim">{p.cs ?? '—'}</Readout>
              </td>
              {/* damage */}
              <td className="px-[8px] py-[8px] border-b border-nexus-line/35 text-center">
                <Readout className="text-[12px] text-nexus-dim">
                  {p.damage != null ? (p.damage / 1000).toFixed(1) : '—'}
                </Readout>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// GameTab — single game's data (compare bars + lineups)
// ---------------------------------------------------------------------------

interface GameTabProps {
  game: Game;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
}

function GameTab({ game, teamA, teamB }: GameTabProps) {
  const teamAId = teamA?.id ?? null;
  const teamBId = teamB?.id ?? null;
  const teamAName = teamA?.name ?? '待定';
  const teamBName = teamB?.name ?? '待定';

  const aPlayers = game.players.filter((p) => p.teamId === teamAId);
  const bPlayers = game.players.filter((p) => p.teamId === teamBId);

  const aKills  = aPlayers.reduce((s, p) => s + (p.kills  ?? 0), 0);
  const bKills  = bPlayers.reduce((s, p) => s + (p.kills  ?? 0), 0);
  const aGold   = aPlayers.reduce((s, p) => s + (p.gold   ?? 0), 0);
  const bGold   = bPlayers.reduce((s, p) => s + (p.gold   ?? 0), 0);
  const aDamage = aPlayers.reduce((s, p) => s + (p.damage ?? 0), 0);
  const bDamage = bPlayers.reduce((s, p) => s + (p.damage ?? 0), 0);

  const aWon = game.winnerTeamId === teamAId;
  const bWon = game.winnerTeamId === teamBId;
  const blueIsA = game.blueTeamId === teamAId;

  const hasStats = game.players.length > 0;
  const hasNumericStats = aKills + bKills + aGold + bGold + aDamage + bDamage > 0;

  return (
    <div className="grid gap-4">
      {/* game meta bar */}
      <div className="flex items-center gap-3 px-1">
        <Kicker>第 {game.index + 1} 局</Kicker>
        {game.durationSeconds != null && (
          <Readout className="text-[11px] text-nexus-dim">
            {fmtDuration(game.durationSeconds)}
          </Readout>
        )}
        {game.winnerTeamId && (
          <Chip variant="good" className="ml-auto">
            {game.winnerTeamId === teamAId
              ? teamAName
              : game.winnerTeamId === teamBId
              ? teamBName
              : '胜者'}{' '}
            胜
          </Chip>
        )}
      </div>

      {/* compare bars — only when numeric stats are available */}
      {hasStats && hasNumericStats && (
        <Panel className="px-4 py-4">
          <Kicker className="block mb-3">团队数据对比</Kicker>
          <CompareBar label="击杀" a={aKills} b={bKills} />
          <CompareBar
            label="经济 (k)"
            a={Math.round(aGold / 1000)}
            b={Math.round(bGold / 1000)}
          />
          <CompareBar
            label="输出 (k)"
            a={Math.round(aDamage / 1000)}
            b={Math.round(bDamage / 1000)}
          />
        </Panel>
      )}

      {/* Team A lineup */}
      <Panel>
        <PanelHead
          title={teamAName}
          actions={
            aWon ? (
              <Chip variant="good">胜</Chip>
            ) : (
              <Chip>{blueIsA ? '蓝方' : '红方'}</Chip>
            )
          }
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: 'rgb(var(--accent-n))' }}
          />
        </PanelHead>
        <LineupTable players={aPlayers} mvpRegistrationId={game.mvpRegistrationId} />
      </Panel>

      {/* Team B lineup */}
      <Panel>
        <PanelHead
          title={teamBName}
          actions={
            bWon ? (
              <Chip variant="good">胜</Chip>
            ) : (
              <Chip>{!blueIsA ? '蓝方' : '红方'}</Chip>
            )
          }
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: 'rgb(var(--accent-n2))' }}
          />
        </PanelHead>
        <LineupTable players={bPlayers} mvpRegistrationId={game.mvpRegistrationId} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MatchDrawer — the actual slide-over component
// ---------------------------------------------------------------------------

interface MatchDrawerProps {
  matchId: string | null;
  onClose: () => void;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; detail: MatchDetail };

export function MatchDrawer({ matchId, onClose }: MatchDrawerProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' });
  const [activeGame, setActiveGame] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // Portal requires DOM to be ready
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch + animate in when matchId changes
  useEffect(() => {
    if (!matchId) {
      // Animate out — clear data after transition completes
      setOpen(false);
      const t = setTimeout(() => setFetchState({ status: 'idle' }), 300);
      return () => clearTimeout(t);
    }

    setFetchState({ status: 'loading' });
    setActiveGame(0);

    // Trigger slide-in on next paint so CSS transition fires
    const raf = requestAnimationFrame(() => setOpen(true));

    fetch(`/api/tournament/public/match/${matchId}`)
      .then(async (res) => {
        if (!res.ok) {
          const msg = res.status === 404 ? '比赛不存在' : `请求失败 (${res.status})`;
          setFetchState({ status: 'error', message: msg });
          return;
        }
        const body = await res.json();
        const detail: MatchDetail = body.detail;
        if (!detail) {
          setFetchState({ status: 'error', message: '返回数据异常' });
          return;
        }
        setFetchState({ status: 'ok', detail });
      })
      .catch(() => {
        setFetchState({ status: 'error', message: '网络请求失败' });
      });

    return () => cancelAnimationFrame(raf);
  }, [matchId]);

  // ESC key
  useEffect(() => {
    if (!matchId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [matchId, onClose]);

  // Don't render portal until client is mounted
  if (!mounted) return null;

  // Nothing to show and not animating out
  if (!matchId && !open) return null;

  const detail = fetchState.status === 'ok' ? fetchState.detail : null;

  const teamAWins = detail
    ? detail.games.filter((g) => g.winnerTeamId === detail.teamA?.id).length
    : 0;
  const teamBWins = detail
    ? detail.games.filter((g) => g.winnerTeamId === detail.teamB?.id).length
    : 0;

  const isFinished = detail?.status === 'FINISHED';
  const teamAName = detail?.teamA?.name ?? '待定';
  const teamBName = detail?.teamB?.name ?? '待定';

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      aria-label="比赛详情"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgb(0 0 0 / 0.55)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          transition: 'opacity 0.26s cubic-bezier(.22,.61,.36,1)',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(680px, 96vw)',
          background: 'rgb(var(--surface))',
          borderLeft: '1px solid rgb(var(--accent-n) / 0.35)',
          boxShadow: '-20px 0 60px rgb(0 0 0 / 0.45)',
          overflowY: 'auto',
          overflowX: 'hidden',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.26s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        {/* ── Sticky header ─────────────────────────────────────── */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: 'rgb(var(--surface))',
            borderBottom: '1px solid rgb(var(--line))',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div className="flex items-center gap-[10px] min-w-0">
            <Readout className="text-[11px] shrink-0" style={{ color: 'rgb(var(--accent-n))' }}>
              ◇ MATCH
            </Readout>
            {detail && (
              <span className="font-body text-[13px] text-nexus-ink truncate">
                {detail.label ?? detail.roundKey ?? '比赛详情'}
              </span>
            )}
            {detail && <Chip className="shrink-0">BO{detail.bestOf}</Chip>}
            {isFinished ? (
              <Chip variant="good" className="shrink-0">已结束</Chip>
            ) : detail ? (
              <Chip variant="ac" className="shrink-0">待开赛</Chip>
            ) : null}
          </div>
          <NexusButton
            size="sm"
            onClick={onClose}
            aria-label="关闭比赛详情"
            style={{ flexShrink: 0, width: 32, padding: 0 }}
          >
            ✕
          </NexusButton>
        </div>

        {/* ── Loading state ─────────────────────────────────────── */}
        {fetchState.status === 'loading' && (
          <div className="flex items-center justify-center py-24">
            <Readout className="text-nexus-faint text-[13px]">加载中…</Readout>
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────── */}
        {fetchState.status === 'error' && (
          <div className="flex items-center justify-center py-24">
            <Readout className="text-[13px]" style={{ color: 'rgb(var(--bad))' }}>
              {fetchState.message}
            </Readout>
          </div>
        )}

        {/* ── Match content ─────────────────────────────────────── */}
        {detail && (
          <div style={{ padding: '18px 18px 32px' }}>
            {/* Score panel */}
            <Panel glow className="mb-5 px-4 py-5">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                {/* Team A */}
                <div className="text-right">
                  <div
                    className="font-display text-[22px] font-bold leading-none truncate"
                    style={{
                      color:
                        detail.winnerTeamId === detail.teamA?.id
                          ? 'rgb(var(--accent-n))'
                          : 'rgb(var(--ink))',
                    }}
                  >
                    {teamAName}
                  </div>
                  <Kicker className="mt-1">A 方</Kicker>
                </div>

                {/* Score */}
                <div className="text-center shrink-0">
                  {isFinished ? (
                    <Readout
                      className="text-[32px] font-bold leading-none"
                      style={{ color: 'rgb(var(--ink))', letterSpacing: 2 }}
                    >
                      {teamAWins}
                      <span className="text-nexus-faint mx-[6px]">:</span>
                      {teamBWins}
                    </Readout>
                  ) : (
                    <span
                      className="font-display text-[20px]"
                      style={{ color: 'rgb(var(--accent-n))' }}
                    >
                      VS
                    </span>
                  )}
                  {detail.scheduledAt && !isFinished && (
                    <Kicker className="block mt-1">
                      {fmtDate(detail.scheduledAt)}
                    </Kicker>
                  )}
                </div>

                {/* Team B */}
                <div className="text-left">
                  <div
                    className="font-display text-[22px] font-bold leading-none truncate"
                    style={{
                      color:
                        detail.winnerTeamId === detail.teamB?.id
                          ? 'rgb(var(--accent-n2))'
                          : 'rgb(var(--ink))',
                    }}
                  >
                    {teamBName}
                  </div>
                  <Kicker className="mt-1">B 方</Kicker>
                </div>
              </div>
            </Panel>

            {/* No games yet */}
            {detail.games.length === 0 && (
              <Panel className="py-10 text-center">
                {isFinished ? (
                  <Readout className="text-nexus-faint text-[13px]">
                    比赛已结束，暂无对局明细
                  </Readout>
                ) : (
                  <div className="space-y-2">
                    <Kicker as="p" className="block">对局尚未开始</Kicker>
                    {detail.scheduledAt && (
                      <Readout className="text-[13px] text-nexus-ink">
                        预定开赛 · {fmtDate(detail.scheduledAt)}
                      </Readout>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {/* Games */}
            {detail.games.length > 0 && (
              <div className="space-y-4">
                {/* Tab strip — only for multi-game series */}
                {detail.games.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {detail.games.map((g, i) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setActiveGame(i)}
                        className="font-mono text-[11px] uppercase tracking-[0.06em] px-3 h-7 border rounded-[var(--radius-nexus)] transition-colors duration-150 cursor-pointer"
                        style={{
                          background:
                            activeGame === i
                              ? 'rgb(var(--accent-n) / 0.15)'
                              : 'transparent',
                          borderColor:
                            activeGame === i
                              ? 'rgb(var(--accent-n) / 0.6)'
                              : 'rgb(var(--line))',
                          color:
                            activeGame === i
                              ? 'rgb(var(--accent-n))'
                              : 'rgb(var(--dim))',
                        }}
                      >
                        第 {g.index + 1} 局
                      </button>
                    ))}
                  </div>
                )}

                {/* Active game panel */}
                {detail.games[activeGame] && (
                  <GameTab
                    key={detail.games[activeGame].id}
                    game={detail.games[activeGame]}
                    teamA={detail.teamA}
                    teamB={detail.teamB}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
