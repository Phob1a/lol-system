import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl';

export const dynamic = 'force-dynamic';

export default async function DraftConsolePage() {
  const [snapshot, captainCount, config, pool] = await Promise.all([
    getDraftSnapshot(),
    prisma.player.count({ where: { isCaptain: true, isRetired: false } }),
    prisma.config.findUnique({ where: { id: 1 } }),
    prisma.player.findMany({
      where: { isCaptain: false, isRetired: false },
      select: {
        id: true,
        gameId: true,
        nickname: true,
        cost: true,
        primaryPositions: true,
        secondaryPositions: true,
        isCaptain: true,
        isRetired: true,
      },
      orderBy: { gameId: 'asc' },
    }),
  ]);

  return (
    <DraftControl
      initialSnapshot={snapshot}
      activeCaptainCount={captainCount}
      teamBudget={config?.teamBudget ?? 1000}
      pool={pool}
    />
  );
}
