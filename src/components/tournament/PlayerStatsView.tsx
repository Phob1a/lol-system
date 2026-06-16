'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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
// Types (mirror of PlayerTournamentStats + PlayerGameRow from player-stats-service)
// ---------------------------------------------------------------------------

export type PlayerGameRow = {
  gameId: string;
  matchId: string;
  matchLabel: string;
  opponent: string;
  championId: string;
  championName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  gold: number;
  win: boolean;
  isMvp: boolean;
};

export type PlayerSummary = {
  games: number;
  wins: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number;
  avgCs: number;
  avgDamage: number;
  avgGold: number;
  mvpCount: number;
};

export type PlayerTournamentStats = {
  playerId: string;
  nickname: string;
  summary: PlayerSummary;
  games: PlayerGameRow[];
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card px-4 py-3 gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function PlayerHeader({
  nickname,
  summary,
}: {
  nickname: string;
  summary: PlayerSummary;
}) {
  return (
    <div className="mb-6 space-y-4">
      <h1 className="text-2xl font-bold">{nickname}</h1>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-10">
        <StatCard label="场次" value={summary.games} />
        <StatCard label="胜场" value={summary.wins} />
        <StatCard label="KDA" value={summary.kda} />
        <StatCard label="MVP" value={summary.mvpCount} />
        <StatCard label="场均K" value={summary.avgKills} />
        <StatCard label="场均D" value={summary.avgDeaths} />
        <StatCard label="场均A" value={summary.avgAssists} />
        <StatCard label="场均CS" value={summary.avgCs} />
        <StatCard label="场均伤害" value={Math.round(summary.avgDamage).toLocaleString()} />
        <StatCard label="场均金币" value={Math.round(summary.avgGold).toLocaleString()} />
      </div>
    </div>
  );
}

function GamesTable({ games }: { games: PlayerGameRow[] }) {
  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-muted-foreground text-sm">暂无对局记录</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>比赛</TableHead>
            <TableHead>对手</TableHead>
            <TableHead>英雄</TableHead>
            <TableHead className="text-center">K</TableHead>
            <TableHead className="text-center">D</TableHead>
            <TableHead className="text-center">A</TableHead>
            <TableHead className="text-center">胜负</TableHead>
            <TableHead className="text-center">MVP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map((row) => (
            <TableRow key={row.gameId} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                <Link
                  href={`/tournament/match/${row.matchId}`}
                  className="hover:underline"
                >
                  {row.matchLabel}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.opponent}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <ChampionIcon
                    championId={row.championId}
                    championName={row.championName}
                    size={20}
                  />
                  <span className="text-xs text-muted-foreground">
                    {row.championName ?? row.championId}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center tabular-nums">{row.kills}</TableCell>
              <TableCell className="text-center tabular-nums">{row.deaths}</TableCell>
              <TableCell className="text-center tabular-nums">{row.assists}</TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={row.win ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5 py-0"
                >
                  {row.win ? '胜' : '负'}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                {row.isMvp && (
                  <Badge variant="default" className="text-[10px] px-1 py-0">
                    MVP
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PlayerStatsView({ stats }: { stats: PlayerTournamentStats }) {
  return (
    <div className="space-y-6">
      <PlayerHeader nickname={stats.nickname} summary={stats.summary} />
      <div>
        <h2 className="text-base font-semibold mb-3">逐场记录</h2>
        <GamesTable games={stats.games} />
      </div>
    </div>
  );
}
