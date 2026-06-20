'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  PlayerStatsView,
  type PlayerTournamentStats,
} from '@/components/tournament/PlayerStatsView';
import { ArenaCta, ArenaEmptyState, PublicArenaShell } from '@/components/public-arena';

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
      <PublicArenaShell bleed>
        <ArenaEmptyState
          eyebrow="PLAYER PROFILE"
          title="选手档案加载中"
          description="正在同步公开数据。"
        />
      </PublicArenaShell>
    );
  }

  if (stats === null) {
    return (
      <PublicArenaShell bleed>
        <ArenaEmptyState
          eyebrow="PLAYER PROFILE"
          title="选手不存在或暂无数据"
          description="该选手还没有可公开的赛事数据。"
          action={<ArenaCta href="/tournament">返回赛事页</ArenaCta>}
        />
      </PublicArenaShell>
    );
  }

  return <PlayerStatsView stats={stats} />;
}
