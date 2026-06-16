'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { championIconUrl } from '@/lib/tournament/champions';

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

function ChampionIcon({
  championId,
  championName,
  size = 24,
}: {
  championId: string;
  championName: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  if (!championId || errored) {
    return (
      <span className="text-xs text-muted-foreground">{championName ?? championId}</span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(championId)}
      alt={championName ?? championId}
      width={size}
      height={size}
      className="rounded-sm object-cover"
      onError={() => setErrored(true)}
    />
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

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <Link
          href="/tournament"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回赛事页
        </Link>
      </div>

      <div className="grid gap-6 px-4 py-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:px-6">
        <div className="min-w-0 text-center lg:text-left">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {[detail.roundKey, `BO${detail.bestOf}`].filter(Boolean).join(' · ')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-normal">{matchLabel}</h1>
          {detail.status === 'FINISHED' && winnerName && (
            <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {winnerName} 胜
            </p>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-sm items-center justify-between rounded-lg bg-muted/30 px-4 py-3 text-center lg:w-80">
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-sm font-semibold ${
                detail.winnerTeamId === detail.teamA?.id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
              }`}
            >
              {teamAName}
            </div>
          </div>
          <div className="mx-4 flex items-baseline gap-2 tabular-nums">
            <span className="text-4xl font-black leading-none">{teamAWins}</span>
            <span className="text-lg font-semibold text-muted-foreground">:</span>
            <span className="text-4xl font-black leading-none">{teamBWins}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-sm font-semibold ${
                detail.winnerTeamId === detail.teamB?.id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
              }`}
            >
              {teamBName}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center lg:max-w-xs">
          <div className="rounded-lg border bg-background/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">局数</div>
            <div className="mt-1 text-lg font-bold">{detail.games.length}</div>
          </div>
          <div className="rounded-lg border bg-background/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">赛制</div>
            <div className="mt-1 text-lg font-bold">BO{detail.bestOf}</div>
          </div>
          <div className="rounded-lg border bg-background/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">状态</div>
            <div className="mt-1 text-lg font-bold">
              {detail.status === 'FINISHED' ? '已结束' : detail.status}
            </div>
          </div>
        </div>
      </div>
    </section>
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
      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        BP 时间线
      </h4>
      <div className="flex flex-wrap gap-2">
        {game.bans.map((ban) => {
          const isBlue = ban.teamId === game.blueTeamId;
          const isBan = ban.type === 'BAN';
          const teamName =
            ban.teamId === teamAId ? 'A' : ban.teamId === teamBId ? 'B' : '?';
          return (
            <div
              key={`${ban.order}-${ban.championId}`}
              className={`flex flex-col items-center gap-1 p-1 rounded border text-xs ${
                isBlue
                  ? 'border-blue-400/50 bg-blue-500/10'
                  : 'border-red-400/50 bg-red-500/10'
              }`}
            >
              <span
                className={`text-[10px] font-medium ${
                  isBlue
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {isBan ? 'BAN' : 'PICK'} · 队{teamName}
              </span>
              <ChampionIcon
                championId={ban.championId}
                championName={ban.championName}
                size={28}
              />
              <span className="text-[10px] text-muted-foreground">#{ban.order}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10-player comparison table
// ---------------------------------------------------------------------------

function PlayersTable({
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
  if (game.players.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">仅记录胜负</p>
    );
  }

  const teamAPlayers = game.players.filter((p) => p.teamId === teamAId);
  const teamBPlayers = game.players.filter((p) => p.teamId === teamBId);
  const teamAIsBlue = teamAId === game.blueTeamId;

  const renderTeamRows = (players: Player[], teamName: string, isBlue: boolean) => {
    if (players.length === 0) return null;
    const isWinner =
      game.winnerTeamId === (isBlue === teamAIsBlue ? teamAId : teamBId);
    return (
      <>
        <TableRow className={isBlue ? 'bg-blue-500/5' : 'bg-red-500/5'}>
          <TableHead
            colSpan={8}
            className={`text-xs font-semibold py-1 ${
              isBlue
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-red-700 dark:text-red-300'
            }`}
          >
            {isBlue ? '蓝方' : '红方'} · {teamName}
            {isWinner && (
              <span className="ml-2 text-green-600 dark:text-green-400">胜</span>
            )}
          </TableHead>
        </TableRow>
        {players.map((player) => {
          const isMvp = player.registrationId === game.mvpRegistrationId;
          return (
            <TableRow key={player.registrationId}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-1">
                  {player.playerId ? (
                    <Link
                      href={`/tournament/player/${player.playerId}`}
                      className="hover:underline"
                    >
                      {player.nickname}
                    </Link>
                  ) : (
                    player.nickname
                  )}
                  {isMvp && (
                    <Badge variant="default" className="text-[10px] px-1 py-0 ml-1">
                      MVP
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <ChampionIcon
                    championId={player.championId}
                    championName={player.championName}
                    size={20}
                  />
                  <span className="text-xs text-muted-foreground">
                    {player.championName ?? player.championId}
                  </span>
                </div>
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.kills ?? '-'}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.deaths ?? '-'}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.assists ?? '-'}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.cs ?? '-'}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.damage != null ? player.damage.toLocaleString() : '-'}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                {player.gold != null ? player.gold.toLocaleString() : '-'}
              </TableCell>
            </TableRow>
          );
        })}
      </>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>选手</TableHead>
          <TableHead>英雄</TableHead>
          <TableHead className="text-center">K</TableHead>
          <TableHead className="text-center">D</TableHead>
          <TableHead className="text-center">A</TableHead>
          <TableHead className="text-center">补刀</TableHead>
          <TableHead className="text-center">伤害</TableHead>
          <TableHead className="text-center">金币</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {renderTeamRows(teamAPlayers, teamAName, teamAIsBlue)}
        {renderTeamRows(teamBPlayers, teamBName, !teamAIsBlue)}
      </TableBody>
    </Table>
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
  const redWon =
    game.winnerTeamId !== null && game.winnerTeamId !== game.blueTeamId;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      {/* Blue/Red team indicator bar */}
      <div
        className="flex min-h-8 overflow-hidden rounded text-xs font-medium"
        aria-label={`第 ${game.index + 1} 局蓝红方`}
      >
        <div
          className={`flex flex-1 items-center justify-center gap-1 bg-blue-500/20 px-2 text-blue-700 dark:text-blue-300 ${
            blueWon ? 'font-bold' : ''
          }`}
        >
          <span>{blueTeamName}（蓝）</span>
          {blueWon ? <span aria-hidden="true">✓</span> : null}
        </div>
        <div
          className={`flex flex-1 items-center justify-center gap-1 bg-red-500/20 px-2 text-red-700 dark:text-red-300 ${
            redWon ? 'font-bold' : ''
          }`}
        >
          <span>{redTeamName}（红）</span>
          {redWon ? <span aria-hidden="true">✓</span> : null}
        </div>
      </div>

      {/* Duration */}
      {game.durationSeconds != null && (
        <p className="text-xs font-medium text-muted-foreground">
          时长：{formatDuration(game.durationSeconds)}
        </p>
      )}

      {!hasDetail ? (
        <p className="text-sm text-muted-foreground text-center py-4">仅记录胜负</p>
      ) : (
        <>
          <BpTimeline game={game} teamAId={teamAId} teamBId={teamBId} />
          <PlayersTable
            game={game}
            teamAId={teamAId}
            teamBId={teamBId}
            teamAName={teamAName}
            teamBName={teamBName}
          />
        </>
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
        <section className="rounded-lg border bg-card py-10 text-center">
          <p className="text-sm text-muted-foreground">暂无对局明细</p>
        </section>
      ) : (
        <Tabs defaultValue={`game-${detail.games[0].index}`} className="w-full">
          <TabsList className="mb-4">
            {detail.games.map((g) => (
              <TabsTrigger key={g.id} value={`game-${g.index}`}>
                第 {g.index + 1} 局
              </TabsTrigger>
            ))}
          </TabsList>
          {detail.games.map((g) => (
            <TabsContent key={g.id} value={`game-${g.index}`}>
              <GamePanel
                game={g}
                teamAId={teamAId}
                teamBId={teamBId}
                teamAName={teamAName}
                teamBName={teamBName}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
