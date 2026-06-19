'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  PlayerStatsView,
  type PlayerTournamentStats,
} from '@/components/tournament/PlayerStatsView';

export default function PlayerStatsPage() {
  const params = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const debug = searchParams?.get('debug') === '1';
  const [stats, setStats] = useState<PlayerTournamentStats | null | undefined>(undefined);

  useEffect(() => {
    const id = params?.playerId;
    if (!id) return;
    fetch(`/api/tournament/public/player/${id}${debug ? '?debug=1' : ''}`)
      .then(async (res) => {
        if (!res.ok) {
          setStats(null);
          return;
        }
        const body = (await res.json()) as { stats?: PlayerTournamentStats };
        setStats(body.stats ?? null);
      })
      .catch(() => setStats(null));
  }, [params?.playerId, debug]);

  if (stats === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">选手不存在或暂无数据</p>
      </div>
    );
  }

  return <PlayerStatsView stats={stats} />;
}
