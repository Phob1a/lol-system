import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { listSeasons } from '@/lib/season/season-service';
import { SpectatorView } from '@/components/live/SpectatorView';

export const dynamic = 'force-dynamic';

export default async function LivePage({
  searchParams,
}: {
  searchParams: { season?: string };
}) {
  const seasons = await listSeasons(prisma);
  const draftable = seasons.filter((s) =>
    ['DRAFTING', 'COMPLETED', 'ARCHIVED'].includes(s.status),
  );
  const selected =
    draftable.find((s) => s.id === searchParams.season) ?? draftable[0] ?? null;

  if (!selected) {
    return <div className="text-center text-muted-foreground">选秀尚未开始</div>;
  }

  const [snapshot, poolRegistrations] = await Promise.all([
    getDraftSnapshot(selected.id),
    prisma.registration.findMany({
      where: { seasonId: selected.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
  ]);
  const flatPool = poolRegistrations.map((r) => ({
    id: r.id,
    gameId: r.player.gameId,
    nickname: r.nickname,
    cost: r.cost,
    primaryPositions: r.primaryPositions,
    secondaryPositions: r.secondaryPositions,
  }));
  return (
    <SpectatorView
      seasons={draftable}
      selectedSeason={selected}
      initialSnapshot={snapshot}
      poolRegistrations={flatPool}
    />
  );
}
