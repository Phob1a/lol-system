import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl';

export const dynamic = 'force-dynamic';

export default async function DraftConsolePage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) return <div className="text-muted-foreground">请先创建赛事</div>;

  const [snapshot, captainCount, pool] = await Promise.all([
    getDraftSnapshot(tournament.id),
    prisma.registration.count({
      where: { tournamentId: tournament.id, isCaptain: true, status: 'ACTIVE' },
    }),
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, isCaptain: false, status: 'ACTIVE' },
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
      tournament={tournament}
      initialSnapshot={snapshot}
      activeCaptainCount={captainCount}
      teamBudget={tournament.teamBudget}
      pool={pool.map((r) => ({
        id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
        primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
      }))}
    />
  );
}
