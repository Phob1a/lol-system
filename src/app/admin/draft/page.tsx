import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl';

export const dynamic = 'force-dynamic';

export default async function DraftConsolePage() {
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">请先创建赛季</div>;

  const [snapshot, captainCount, pool] = await Promise.all([
    getDraftSnapshot(season.id),
    prisma.registration.count({
      where: { seasonId: season.id, isCaptain: true, status: 'ACTIVE' },
    }),
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
  ]);

  return (
    <DraftControl
      season={season}
      initialSnapshot={snapshot}
      activeCaptainCount={captainCount}
      teamBudget={season.teamBudget}
      pool={pool.map((r) => ({
        id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
        primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
      }))}
    />
  );
}
