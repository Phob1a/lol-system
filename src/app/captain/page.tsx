import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { computeTeamPreviews } from '@/lib/teams/preview';
import { CaptainDashboard } from '@/components/draft/CaptainDashboard';
import { ArenaEmptyState } from '@/components/public-arena';

export const dynamic = 'force-dynamic';

export default async function CaptainPage() {
  const session = await getSession();
  const tournament = await getActiveTournament(prisma);
  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="DRAFT OFFLINE"
        title="暂无进行中的赛事"
        description="赛事开启后，这里会进入选秀工作台，并同步队伍预算、选人池和实时选秀状态。"
      />
    );
  }

  const ownTeam = session?.user.teamId
    ? await prisma.team.findUnique({
        where: { id: session.user.teamId },
        select: { captainId: true },
      })
    : null;

  const [pool, captains, snapshot] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    prisma.registration.findMany({
      where: { tournamentId: tournament.id, isCaptain: true, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    getDraftSnapshot(tournament.id),
  ]);

  const flat = (r: (typeof pool)[number]) => ({
    id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
    primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
  });

  return (
    <CaptainDashboard
      initialSnapshot={snapshot}
      pool={pool.map(flat)}
      virtualTeams={computeTeamPreviews(captains.map(flat), tournament.teamBudget)}
      ownCaptainId={ownTeam?.captainId ?? null}
      teamBudget={tournament.teamBudget}
    />
  );
}
