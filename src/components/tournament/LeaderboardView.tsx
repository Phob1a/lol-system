'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardRow = {
  registrationId: string;
  playerId: string;
  nickname: string;
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

type SortKey = keyof Omit<LeaderboardRow, 'registrationId' | 'playerId' | 'nickname'>;
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-muted-foreground opacity-30">↕</span>;
  return <span className="ml-1">{dir === 'desc' ? '↓' : '↑'}</span>;
}

function SortableHead({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  colKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className="text-center cursor-pointer select-none whitespace-nowrap hover:text-foreground"
      onClick={() => onSort(colKey)}
    >
      {label}
      <SortIndicator active={sortKey === colKey} dir={sortDir} />
    </TableHead>
  );
}

function sortRows(rows: LeaderboardRow[], key: SortKey, dir: SortDir): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] as number;
    const bv = b[key] as number;
    return dir === 'desc' ? bv - av : av - bv;
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LeaderboardView() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('kda');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tournament/public/leaderboard');
      const body = (await res.json()) as { rows?: LeaderboardRow[] };
      setRows(body.rows ?? []);
    } catch {
      // leave rows as-is on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();

    // Reuse the same SSE stream that PublicTournamentView uses for invalidation
    const es = new EventSource('/api/tournament/public/stream');
    es.addEventListener('tournament', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string };
        if (data.type === 'tournament.invalidated') void fetchData();
      } catch {
        // ignore malformed frames
      }
    });

    return () => es.close();
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">暂无数据</p>
      </div>
    );
  }

  const sorted = sortRows(rows, sortKey, sortDir);

  const headProps = { sortKey, sortDir, onSort: handleSort } as const;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-center text-muted-foreground">#</TableHead>
            <TableHead>选手</TableHead>
            <SortableHead label="场次" colKey="games" {...headProps} />
            <SortableHead label="胜场" colKey="wins" {...headProps} />
            <SortableHead label="场均K" colKey="avgKills" {...headProps} />
            <SortableHead label="场均D" colKey="avgDeaths" {...headProps} />
            <SortableHead label="场均A" colKey="avgAssists" {...headProps} />
            <SortableHead label="KDA" colKey="kda" {...headProps} />
            <SortableHead label="补刀" colKey="avgCs" {...headProps} />
            <SortableHead label="伤害" colKey="avgDamage" {...headProps} />
            <SortableHead label="金币" colKey="avgGold" {...headProps} />
            <SortableHead label="MVP" colKey="mvpCount" {...headProps} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, idx) => (
            <TableRow key={row.registrationId} className="hover:bg-muted/50">
              <TableCell className="text-center text-muted-foreground text-xs">
                {idx + 1}
              </TableCell>
              <TableCell className="font-medium">
                <Link
                  href={`/tournament/player/${row.playerId}`}
                  className="hover:underline"
                >
                  {row.nickname}
                </Link>
              </TableCell>
              <TableCell className="text-center tabular-nums">{row.games}</TableCell>
              <TableCell className="text-center tabular-nums">{row.wins}</TableCell>
              <TableCell className="text-center tabular-nums">{row.avgKills}</TableCell>
              <TableCell className="text-center tabular-nums">{row.avgDeaths}</TableCell>
              <TableCell className="text-center tabular-nums">{row.avgAssists}</TableCell>
              <TableCell className="text-center tabular-nums font-semibold">
                {row.kda}
              </TableCell>
              <TableCell className="text-center tabular-nums">{row.avgCs}</TableCell>
              <TableCell className="text-center tabular-nums">
                {row.avgDamage.toLocaleString()}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {row.avgGold.toLocaleString()}
              </TableCell>
              <TableCell className="text-center tabular-nums">{row.mvpCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
