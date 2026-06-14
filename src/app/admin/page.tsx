import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getAdminOverviewStats } from '@/lib/admin/overview-stats';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const tournament = await getActiveTournament(prisma);

  const overviewStats = tournament
    ? await getAdminOverviewStats(prisma, tournament.id)
    : { registrationCount: 0, captainIntentionCount: 0, draftStatus: 'NOT_STARTED' };

  if (!tournament) {
    return (
      <div className="space-y-6">
        <PageHeader title="概览" description="赛事总览" />
        <p className="text-muted-foreground">尚无赛事 · 点击创建</p>
        <Button asChild variant="outline">
          <Link href="/admin/tournament">前往赛事管理</Link>
        </Button>
      </div>
    );
  }

  const statCards = [
    {
      label: 'TOURNAMENT',
      value: `${tournament.name} · ${tournament.status} · 预算 ${tournament.teamBudget} CR`,
      href: '/admin/tournament',
    },
    {
      label: 'REGISTRATIONS',
      value: `${overviewStats.registrationCount} 报名 · ${overviewStats.captainIntentionCount} 意向队长`,
      href: '/admin/registrations',
    },
    {
      label: 'DRAFT',
      value: overviewStats.draftStatus,
      href: '/admin/draft',
    },
    {
      label: 'AUDIT',
      value: '事件日志 · seq monotonic',
      href: '/admin/audit',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="概览" description="赛事总览" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((s) => (
          <Link key={s.href} href={s.href} className="block">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
