'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import ChampAvatar from '@/components/nexus/ChampAvatar';

// ---------------------------------------------------------------------------
// Types (mirror of getPublicMatchDetail return value)
// ---------------------------------------------------------------------------

type Ban = {
  teamId: string;
  type: string;
  championId: string;
  championName: string | null;
  order: number;
};

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
  bans: Ban[];
  players: Player[];
};

export type MatchDetail = {
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// CompareBar — team stat comparison (mirrors MatchDetail.tsx drawer)
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
// Match header — 对阵 + 比分
// ---------------------------------------------------------------------------

function MatchHeader({ detail }: { detail: MatchDetail }) {
  const teamAName = detail.teamA?.name ?? '待定';
  const teamBName = detail.teamB?.name ?? '待定';
  const matchLabel = detail.label ?? detail.roundKey ?? '比赛详情';

  const teamAWins = detail.games.filter(
    (g) => g.winnerTeamId && g.winnerTeamId === detail.teamA?.id,
  ).length;
  const teamBWins = detail.games.filter(
    (g) => g.winnerTeamId && g.winnerTeamId === detail.teamB?.id,
  ).length;
  const winnerName =
    detail.winnerTeamId === detail.teamA?.id
      ? teamAName
      : detail.winnerTeamId === detail.teamB?.id
        ? teamBName
        : null;

  const isFinished = detail.status === 'FINISHED';

  return (
    <Panel as="section">
      {/* Back navigation */}
      <div className="border-b border-nexus-line px-4 py-3">
        <Link
          href="/tournament"
          className="inline-flex items-center gap-2 text-sm font-mono font-semibold text-nexus-dim transition-colors hover:text-nexus-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          返回赛事页
        </Link>
      </div>

      {/* Match identity + score + meta */}
      <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:px-6">
        {/* Left: label + status */}
        <div className="min-w-0 text-center lg:text-left">
          <Kicker as="p">
            {[detail.roundKey, `BO${detail.bestOf}`].filter(Boolean).join(' · ')}
          </Kicker>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-normal text-nexus-ink">
            {matchLabel}
          </h1>
          {isFinished && winnerName && (
            <p
              className="mt-2 text-sm font-semibold font-mono"
              style={{ color: 'rgb(var(--good))' }}
            >
              {winnerName} 胜
            </p>
          )}
        </div>

        {/* Centre: score bar */}
        <Panel
          glow
          className="mx-auto flex w-full max-w-sm items-center justify-between px-4 py-3 text-center lg:w-80"
        >
          <div className="min-w-0 flex-1 text-right">
            <div
              className="truncate font-display text-sm font-semibold"
              style={{
                color:
                  detail.winnerTeamId === detail.teamA?.id
                    ? 'rgb(var(--accent-n))'
                    : 'rgb(var(--ink))',
              }}
            >
              {teamAName}
            </div>
          </div>
          <div className="mx-4 flex items-baseline gap-2 tabular-nums">
            <Readout
              className="font-display text-4xl font-black leading-none"
              style={{ color: 'rgb(var(--ink))' }}
            >
              {teamAWins}
            </Readout>
            <Readout className="text-lg font-semibold text-nexus-faint">:</Readout>
            <Readout
              className="font-display text-4xl font-black leading-none"
              style={{ color: 'rgb(var(--ink))' }}
            >
              {teamBWins}
            </Readout>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div
              className="truncate font-display text-sm font-semibold"
              style={{
                color:
                  detail.winnerTeamId === detail.teamB?.id
                    ? 'rgb(var(--accent-n2))'
                    : 'rgb(var(--ink))',
              }}
            >
              {teamBName}
            </div>
          </div>
        </Panel>

        {/* Right: meta tiles */}
        <div className="grid grid-cols-3 gap-2 text-center lg:max-w-xs">
          {(
            [
              { label: '局数', value: String(detail.games.length) },
              { label: '赛制', value: `BO${detail.bestOf}` },
              { label: '状态', value: isFinished ? '已结束' : detail.status },
            ] as const
          ).map(({ label, value }) => (
            <Panel key={label} className="px-3 py-2">
              <Kicker as="div" className="block text-center">{label}</Kicker>
              <Readout className="mt-1 block text-center text-lg font-bold text-nexus-ink">
                {value}
              </Readout>
            </Panel>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// BP Timeline
// ---------------------------------------------------------------------------

function BpTimeline({
  game,
  teamAId,
  teamBId,
}: {
  game: Game;
  teamAId: string | null;
  teamBId: string | null;
}) {
  if (game.bans.length === 0) return null;

  return (
    <div className="mb-4">
      <Kicker as="h4" className="mb-2 block">
        BP 时间线
      </Kicker>
      <div className="flex flex-wrap gap-2">
        {game.bans.map((ban) => {
          const isBlue = ban.teamId === game.blueTeamId;
          const isBan = ban.type === 'BAN';
          const teamName =
            ban.teamId === teamAId ? 'A' : ban.teamId === teamBId ? 'B' : '?';
          const champKey = ban.championName ?? ban.championId;
          return (
            <div
              key={`${ban.order}-${ban.championId}`}
              className="flex flex-col items-center gap-1 rounded-[var(--radius-nexus)] border p-1 text-xs"
              style={{
                borderColor: isBlue
                  ? 'rgb(var(--accent-n) / 0.5)'
                  : 'rgb(var(--accent-n2) / 0.5)',
                background: isBlue
                  ? 'rgb(var(--accent-n) / 0.08)'
                  : 'rgb(var(--accent-n2) / 0.08)',
              }}
            >
              <Kicker
                style={{
                  color: isBlue ? 'rgb(var(--accent-n))' : 'rgb(var(--accent-n2))',
                }}
              >
                {isBan ? 'BAN' : 'PICK'} · 队{teamName}
              </Kicker>
              <ChampAvatar champion={champKey} size={28} />
              <Kicker>#{ban.order}</Kicker>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lineup table — per-game player rows (mirrors MatchDetail.tsx LineupTable)
// ---------------------------------------------------------------------------

function LineupTable({
  players,
  mvpRegistrationId,
}: {
  players: Player[];
  mvpRegistrationId: string | null;
}) {
  if (players.length === 0) {
    return (
      <p className="py-4 text-center font-mono text-[12px] text-nexus-faint">
        仅记录胜负
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
      <thead>
        <tr>
          {['选手', '英雄', 'K/D/A', '补刀', '伤害 (k)', '金币 (k)'].map((h, i) => (
            <th
              key={i}
              className="border-b border-nexus-line px-2 py-[7px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-nexus-faint"
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
              <td className="whitespace-nowrap border-b border-nexus-line/35 px-2 py-[8px]">
                {p.playerId ? (
                  <Link
                    href={`/tournament/player/${p.playerId}`}
                    className="font-body text-[12.5px] text-nexus-ink transition-colors hover:text-nexus-accent"
                  >
                    {p.nickname}
                  </Link>
                ) : (
                  <span className="font-body text-[12.5px] text-nexus-ink">
                    {p.nickname}
                  </span>
                )}
                {isMvp && (
                  <span
                    className="ml-[5px] text-[11px]"
                    style={{ color: 'rgb(var(--gold))' }}
                  >
                    MVP
                  </span>
                )}
              </td>
              {/* champion */}
              <td className="border-b border-nexus-line/35 px-2 py-[8px]">
                <span className="inline-flex items-center gap-[7px]">
                  {champKey ? <ChampAvatar champion={champKey} size={20} /> : null}
                  <Readout className="text-[12px] text-nexus-dim">
                    {p.championName ?? p.championId ?? '—'}
                  </Readout>
                </span>
              </td>
              {/* kda */}
              <td className="border-b border-nexus-line/35 px-2 py-[8px] text-center">
                <Readout className="text-[12px]">
                  {p.kills ?? '—'}/{p.deaths ?? '—'}/{p.assists ?? '—'}
                </Readout>
              </td>
              {/* cs */}
              <td className="border-b border-nexus-line/35 px-2 py-[8px] text-center">
                <Readout className="text-[12px] text-nexus-dim">{p.cs ?? '—'}</Readout>
              </td>
              {/* damage */}
              <td className="border-b border-nexus-line/35 px-2 py-[8px] text-center">
                <Readout className="text-[12px] text-nexus-dim">
                  {p.damage != null ? (p.damage / 1000).toFixed(1) : '—'}
                </Readout>
              </td>
              {/* gold */}
              <td className="border-b border-nexus-line/35 px-2 py-[8px] text-center">
                <Readout className="text-[12px] text-nexus-dim">
                  {p.gold != null ? (p.gold / 1000).toFixed(1) : '—'}
                </Readout>
              </td>
            </tr>
          );
        })}
      </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single game panel
// ---------------------------------------------------------------------------

function GamePanel({
  game,
  teamAId,
  teamBId,
  teamAName,
  teamBName,
}: {
  game: Game;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
}) {
  const hasDetail = game.players.length > 0 || game.bans.length > 0;
  const blueTeamName = game.blueTeamId === teamAId ? teamAName : teamBName;
  const redTeamName = game.blueTeamId === teamAId ? teamBName : teamAName;
  const blueWon = game.winnerTeamId === game.blueTeamId;
  const redWon = game.winnerTeamId !== null && game.winnerTeamId !== game.blueTeamId;

  const teamAIsBlue = teamAId === game.blueTeamId;
  const aPlayers = game.players.filter((p) => p.teamId === teamAId);
  const bPlayers = game.players.filter((p) => p.teamId === teamBId);

  const aKills  = aPlayers.reduce((s, p) => s + (p.kills  ?? 0), 0);
  const bKills  = bPlayers.reduce((s, p) => s + (p.kills  ?? 0), 0);
  const aGold   = aPlayers.reduce((s, p) => s + (p.gold   ?? 0), 0);
  const bGold   = bPlayers.reduce((s, p) => s + (p.gold   ?? 0), 0);
  const aDamage = aPlayers.reduce((s, p) => s + (p.damage ?? 0), 0);
  const bDamage = bPlayers.reduce((s, p) => s + (p.damage ?? 0), 0);

  const hasNumericStats =
    aKills + bKills + aGold + bGold + aDamage + bDamage > 0;

  const aWon = game.winnerTeamId === teamAId;
  const bWon = game.winnerTeamId === teamBId;

  return (
    <div className="space-y-4">
      {/* Game meta row */}
      <div className="flex items-center gap-3 px-1">
        <Kicker>第 {game.index + 1} 局</Kicker>
        {game.durationSeconds != null && (
          <Readout className="text-[11px] text-nexus-dim">
            {formatDuration(game.durationSeconds)}
          </Readout>
        )}
        {game.winnerTeamId && (
          <Chip variant="good" className="ml-auto">
            胜 ·{' '}
            {game.winnerTeamId === teamAId
              ? teamAName
              : game.winnerTeamId === teamBId
              ? teamBName
              : '胜者'}
          </Chip>
        )}
      </div>

      {/* Blue/Red team indicator bar — aria-label preserved for test */}
      <div
        className="flex min-h-8 overflow-hidden rounded-[var(--radius-nexus)] font-mono text-xs font-medium"
        aria-label={`第 ${game.index + 1} 局蓝红方`}
      >
        <div
          className={`flex flex-1 items-center justify-center gap-1 px-2 ${
            blueWon ? 'font-bold' : ''
          }`}
          style={{
            background: 'rgb(var(--accent-n) / 0.15)',
            color: 'rgb(var(--accent-n))',
          }}
        >
          <span>{blueTeamName}（蓝）</span>
          {blueWon ? <span aria-hidden="true">✓</span> : null}
        </div>
        <div
          className={`flex flex-1 items-center justify-center gap-1 px-2 ${
            redWon ? 'font-bold' : ''
          }`}
          style={{
            background: 'rgb(var(--accent-n2) / 0.12)',
            color: 'rgb(var(--accent-n2))',
          }}
        >
          <span>{redTeamName}（红）</span>
          {redWon ? <span aria-hidden="true">✓</span> : null}
        </div>
      </div>

      {!hasDetail ? (
        <Panel className="py-10 text-center">
          <Readout className="text-[13px] text-nexus-faint">仅记录胜负</Readout>
        </Panel>
      ) : (
        <>
          {/* Compare bars — only when numeric stats available */}
          {game.players.length > 0 && hasNumericStats && (
            <Panel className="px-4 py-4">
              <Kicker className="mb-3 block">团队数据对比</Kicker>
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

          {/* BP timeline */}
          {game.bans.length > 0 && (
            <Panel className="px-4 py-4">
              <BpTimeline game={game} teamAId={teamAId} teamBId={teamBId} />
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
                  <Chip>{teamAIsBlue ? '蓝方' : '红方'}</Chip>
                )
              }
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'rgb(var(--accent-n))' }}
              />
            </PanelHead>
            <LineupTable
              players={aPlayers}
              mvpRegistrationId={game.mvpRegistrationId}
            />
          </Panel>

          {/* Team B lineup */}
          <Panel>
            <PanelHead
              title={teamBName}
              actions={
                bWon ? (
                  <Chip variant="good">胜</Chip>
                ) : (
                  <Chip>{!teamAIsBlue ? '蓝方' : '红方'}</Chip>
                )
              }
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'rgb(var(--accent-n2))' }}
              />
            </PanelHead>
            <LineupTable
              players={bPlayers}
              mvpRegistrationId={game.mvpRegistrationId}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GameTabController — manages active-game state + tab strip
// ---------------------------------------------------------------------------

function GameTabController({
  detail,
  teamAId,
  teamBId,
  teamAName,
  teamBName,
}: {
  detail: MatchDetail;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
}) {
  const [activeGame, setActiveGame] = useState(0);

  return (
    <div className="space-y-4">
      {/* Tab strip — only for multi-game series */}
      {detail.games.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {detail.games.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGame(i)}
              className="h-7 cursor-pointer rounded-[var(--radius-nexus)] border px-3 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-150"
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
        <GamePanel
          key={detail.games[activeGame].id}
          game={detail.games[activeGame]}
          teamAId={teamAId}
          teamBId={teamBId}
          teamAName={teamAName}
          teamBName={teamBName}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function MatchDetailView({ detail }: { detail: MatchDetail }) {
  const teamAId = detail.teamA?.id ?? null;
  const teamBId = detail.teamB?.id ?? null;
  const teamAName = detail.teamA?.name ?? '待定';
  const teamBName = detail.teamB?.name ?? '待定';

  return (
    <div className="space-y-6">
      <MatchHeader detail={detail} />

      {detail.games.length === 0 ? (
        <Panel as="section" className="py-10 text-center">
          <Readout className="text-[13px] text-nexus-faint">暂无对局明细</Readout>
        </Panel>
      ) : (
        <GameTabController
          detail={detail}
          teamAId={teamAId}
          teamBId={teamBId}
          teamAName={teamAName}
          teamBName={teamBName}
        />
      )}
    </div>
  );
}
