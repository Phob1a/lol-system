import { prisma } from '@/lib/db';
import { PlayerManager } from '@/components/players/PlayerManager';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const [players, config] = await Promise.all([
    prisma.player.findMany({ orderBy: { gameId: 'asc' } }),
    prisma.config.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <PlayerManager
      initialPlayers={players}
      draftLocked={config?.draftLocked ?? false}
    />
  );
}
