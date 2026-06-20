'use client';

import dynamic from 'next/dynamic';
import { ArenaCta, PublicArenaHud, PublicArenaShell } from '@/components/public-arena';
import type {
  PlayerGameRow,
  PlayerTournamentStats as ServicePlayerTournamentStats,
} from '@/lib/tournament/player-stats-service';
import { PlayerHero } from './player-stats/PlayerHero';
import { PlayerChampionPool } from './player-stats/PlayerChampionPool';
import { PlayerCareerHighs } from './player-stats/PlayerCareerHighs';
import { PlayerHighlights } from './player-stats/PlayerHighlights';
import { PlayerMatchLog } from './player-stats/PlayerMatchLog';
import { Section } from './player-stats/shared';

export type PlayerTournamentStats = ServicePlayerTournamentStats;
export type { PlayerGameRow };

const chartFallback = (
  <Section title="加载图表…">
    <div className="h-64 animate-pulse rounded-md bg-muted/40" />
  </Section>
);

// Recharts 只进图表组件，并懒加载到 below-fold，避免拖累首屏 bundle。
const AbilityRadar = dynamic(() => import('./player-stats/PlayerCharts').then((m) => m.AbilityRadar), {
  ssr: false,
  loading: () => chartFallback,
});
const FormTrend = dynamic(() => import('./player-stats/PlayerCharts').then((m) => m.FormTrend), {
  ssr: false,
  loading: () => chartFallback,
});

export function PlayerStatsView({ stats }: { stats: PlayerTournamentStats }) {
  return (
    <PublicArenaShell
      bleed
      hud={
        <PublicArenaHud
          eyebrow="LOL-SYSTEM / PLAYER PROFILE"
          title={stats.nickname}
          signals={[
            { label: 'TEAM', detail: stats.teamName ?? 'UNASSIGNED' },
            { label: 'ROLE', detail: stats.primaryPosition ?? 'UNKNOWN' },
            { label: 'GAMES', detail: String(stats.summary.games) },
          ]}
          actions={
            <ArenaCta href="/tournament" variant="ghost">
              返回赛事页
            </ArenaCta>
          }
        />
      }
    >
      <PlayerHero stats={stats} />
      <PlayerChampionPool stats={stats} />
      <PlayerCareerHighs stats={stats} />
      <div className="grid gap-4 xl:grid-cols-2">
        <AbilityRadar radar={stats.extended.radar} />
        <FormTrend trends={stats.extended.trends} />
      </div>
      <PlayerHighlights stats={stats} />
      <PlayerMatchLog games={stats.games} />
    </PublicArenaShell>
  );
}
