import { prisma } from '@/lib/db';
import { PlayerManager } from '@/components/players/PlayerManager.tactical';

export default async function PlayersPage() {
  const players = await prisma.player.findMany({ orderBy: { id: 'asc' } });
  return <PlayerManager players={players as any} />;
}
