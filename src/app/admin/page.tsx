import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const season = await getActiveSeason(prisma);

  const [registrationCount, captainCount, draftSession] = season
    ? await Promise.all([
        prisma.registration.count({ where: { seasonId: season.id, status: 'ACTIVE' } }),
        prisma.registration.count({
          where: { seasonId: season.id, status: 'ACTIVE', isCaptain: true },
        }),
        prisma.draftSession.findUnique({ where: { seasonId: season.id } }),
      ])
    : [0, 0, null];

  const draftStatus = draftSession?.status ?? 'NOT_STARTED';

  if (!season) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="概览" description="赛事总览" />
        <p className="text-muted-foreground">尚无赛季 · 点击创建</p>
        <Button asChild variant="outline">
          <Link href="/admin/season">前往赛季管理</Link>
        </Button>
      </div>
    );
  }

  const stats = [
    {
      label: 'SEASON',
      value: `${season.name} · ${season.status} · 预算 ${season.teamBudget} CR`,
      href: '/admin/season',
    },
    {
      label: 'REGISTRATIONS',
      value: `${registrationCount} 报名 · ${captainCount} 意向队长`,
      href: '/admin/registrations',
    },
    {
      label: 'DRAFT',
      value: draftStatus,
      href: '/admin/draft',
    },
    {
      label: 'AUDIT',
      value: '事件日志 · seq monotonic',
      href: '/admin/audit',
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="概览" description="赛事总览" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
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
