/**
 * 数据中心 / DATA CENTER — /tournament/data
 *
 * Server component: aggregates real Prisma data via getMetaStats(),
 * then passes plain serialisable props to the DataCenter client component.
 *
 * Empty / pre-tournament state: if no active tournament exists, renders a
 * placeholder instead of the full dashboard.
 */

import { prisma } from '@/lib/db';
import { getMetaStats } from '@/lib/tournament/meta-stats-service';
import { DataCenter } from '@/components/tournament/DataCenter';
import Kicker from '@/components/nexus/Kicker';

export const dynamic = 'force-dynamic';

export default async function DataCenterPage() {
  const stats = await getMetaStats(prisma);

  // ── Empty / pre-tournament state ──────────────────────────────────────────
  if (!stats) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px',
          gap: 12,
        }}
      >
        <Kicker>数据中心 · DATA CENTER</Kicker>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgb(var(--faint))',
          }}
        >
          暂无赛事数据
        </p>
      </div>
    );
  }

  return (
    <DataCenter
      kpi={stats.kpi}
      champHeat={stats.champHeat}
      positionMeta={stats.positionMeta}
      mvpBoard={stats.mvpBoard}
      powerRanking={stats.powerRanking}
    />
  );
}
