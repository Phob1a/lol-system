import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl';
import { ArenaCta, ArenaEmptyState } from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function DraftConsolePage() {
  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="DRAFT OFFLINE"
        title="请先创建赛事"
        description="创建赛事并开放报名后，选秀控制台会同步队长、选手池和实时 BP 状态。"
        action={<ArenaCta href="/admin/tournament">前往赛事管理</ArenaCta>}
      />
    );
  }

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
