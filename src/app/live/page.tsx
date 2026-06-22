import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { listTournaments } from '@/lib/tournament/tournament-service';
import { SpectatorView } from '@/components/live/SpectatorView';

export const dynamic = 'force-dynamic';

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const tournaments = await listTournaments(prisma);
  const draftable = tournaments.filter((t) =>
    ['DRAFTING', 'GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED', 'ARCHIVED'].includes(t.status),
  );
  const selected =
    draftable.find((t) => t.id === season) ?? draftable[0] ?? null;

  if (!selected) {
    return <div className="text-center text-muted-foreground">选秀尚未开始</div>;
  }

  const [snapshot, poolRegistrations] = await Promise.all([
    getDraftSnapshot(selected.id),
    prisma.registration.findMany({
      where: { tournamentId: selected.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        availability: true,
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
    availability: r.availability,
  }));
  return (
    <SpectatorView
      tournaments={draftable}
      selectedTournament={selected}
      initialSnapshot={snapshot}
      poolRegistrations={flatPool}
    />
  );
}
