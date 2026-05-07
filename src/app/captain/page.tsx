import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { computeTeamPreviews } from '@/lib/teams/preview';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { CaptainDashboard } from '@/components/draft/CaptainDashboard';

export const dynamic = 'force-dynamic';

export default async function CaptainPage() {
  const session = await getSession();
  const ownGameId = session!.user.gameId;

  const ownPlayer = await prisma.player.findUnique({
    where: { gameId: ownGameId },
    select: { id: true },
  });
  const ownCaptainId = ownPlayer?.id ?? null;

  const [config, pool, captains, snapshot] = await Promise.all([
    prisma.config.findUnique({ where: { id: 1 } }),
    prisma.player.findMany({
      where: { isRetired: false, isCaptain: false },
      orderBy: { gameId: 'asc' },
    }),
    prisma.player.findMany({
      where: { isCaptain: true, isRetired: false },
      orderBy: { gameId: 'asc' },
    }),
    getDraftSnapshot(),
  ]);

  const teamBudget = config?.teamBudget ?? 1000;
  const virtualTeams = computeTeamPreviews(captains, teamBudget);

  return (
    <CaptainDashboard
      initialSnapshot={snapshot}
      pool={pool}
      virtualTeams={virtualTeams}
      ownGameId={ownGameId}
      ownCaptainId={ownCaptainId}
      teamBudget={teamBudget}
    />
  );
}
