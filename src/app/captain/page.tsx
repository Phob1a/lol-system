import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { computeTeamPreviews } from '@/lib/teams/preview';
import { CaptainDashboard } from '@/components/draft/CaptainDashboard';

export const dynamic = 'force-dynamic';

export default async function CaptainPage() {
  const session = await getSession();
  const season = await getActiveSeason(prisma);
  if (!season) return <div className="text-muted-foreground">暂无进行中的赛季</div>;

  const ownTeam = session?.user.teamId
    ? await prisma.team.findUnique({
        where: { id: session.user.teamId },
        select: { captainId: true },
      })
    : null;

  const [pool, captains, snapshot] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: false, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    prisma.registration.findMany({
      where: { seasonId: season.id, isCaptain: true, status: 'ACTIVE' },
      select: {
        id: true, nickname: true, cost: true,
        primaryPositions: true, secondaryPositions: true,
        player: { select: { gameId: true } },
      },
      orderBy: { registeredAt: 'asc' },
    }),
    getDraftSnapshot(season.id),
  ]);

  const flat = (r: (typeof pool)[number]) => ({
    id: r.id, gameId: r.player.gameId, nickname: r.nickname, cost: r.cost,
    primaryPositions: r.primaryPositions, secondaryPositions: r.secondaryPositions,
  });

  return (
    <CaptainDashboard
      initialSnapshot={snapshot}
      pool={pool.map(flat)}
      virtualTeams={computeTeamPreviews(captains.map(flat), season.teamBudget)}
      ownCaptainId={ownTeam?.captainId ?? null}
      teamBudget={season.teamBudget}
    />
  );
}
