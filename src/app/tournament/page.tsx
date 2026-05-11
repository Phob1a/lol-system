import { db } from '@/lib/db';
import { PublicTabs } from './_components/PublicTabs';

export const dynamic = 'force-dynamic';

export default async function PublicTournamentPage() {
  const active = await db.tournament.findFirst({
    where: { status: { in: ['GROUP_STAGE', 'BRACKET_SEEDING', 'KNOCKOUT'] } },
    orderBy: { createdAt: 'desc' },
  });
  const fallback = active ?? await db.tournament.findFirst({
    where: { status: 'FINISHED' }, orderBy: { finishedAt: 'desc' },
  });
  if (!fallback) {
    return <div className="container mx-auto p-6">暂无赛事数据</div>;
  }
  return <PublicTabs tournamentId={fallback.id} />;
}
