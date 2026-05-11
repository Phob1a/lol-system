import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateTournamentForm } from './_components/CreateTournamentForm';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentListPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/access-denied');

  const list = await db.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">赛事管理</h1>
      <CreateTournamentForm />
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">状态</th>
              <th className="p-2 text-left">分组</th>
              <th className="p-2 text-left">出线</th>
              <th className="p-2 text-left">创建时间</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{t.groupCount} × {t.teamsPerGroup}</td>
                <td className="p-2">{t.advancingPerGroup}/组</td>
                <td className="p-2">{t.createdAt.toLocaleString()}</td>
                <td className="p-2 text-right">
                  <Link className="text-primary underline" href={`/admin/tournament/${t.id}`}>进入</Link>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">还没有赛事</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
