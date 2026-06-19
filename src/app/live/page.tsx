import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { listTournaments } from '@/lib/tournament/tournament-service';
import { SpectatorView } from '@/components/live/SpectatorView';
import { ArenaCta, ArenaEmptyState, PublicArenaShell } from '@/components/public-arena';

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
    return (
      <PublicArenaShell className="min-h-screen">
        <ArenaEmptyState
          eyebrow="LIVE SIGNAL OFFLINE"
          title="选秀尚未开始"
          description="有可公开赛季后会自动显示直播控制台。"
          action={<ArenaCta href="/">返回首页</ArenaCta>}
        />
      </PublicArenaShell>
    );
  }

  const [snapshot, poolRegistrations] = await Promise.all([
    getDraftSnapshot(selected.id),
    prisma.registration.findMany({
      where: { tournamentId: selected.id, isCaptain: false, status: 'ACTIVE' },
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
      tournaments={draftable}
      selectedTournament={selected}
      initialSnapshot={snapshot}
      poolRegistrations={flatPool}
    />
  );
}
