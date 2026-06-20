import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import PublicShell from '@/components/layout/PublicShell';
import { OverviewDashboard } from '@/components/home/OverviewDashboard';
import { PreTournamentOverview } from '@/components/home/PreTournamentOverview';
import { fetchOverviewData } from '@/components/home/overview-data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournament = await getActiveTournament(prisma);

  // Fetch full overview data if tournament exists
  const data = tournament
    ? await fetchOverviewData(
        prisma,
        tournament.id,
        tournament.name,
        tournament.kind,
        tournament.status,
      )
    : { kind: 'no-tournament' as const };

  return (
    <PublicShell
      tournament={
        tournament
          ? { name: tournament.name, status: tournament.status }
          : null
      }
    >
      {data.kind === 'overview' && <OverviewDashboard props={data.props} />}

      {data.kind === 'pre-tournament' && (
        <PreTournamentOverview
          tournamentName={data.tournamentName}
          tournamentStatus={data.tournamentStatus}
          registrationCount={data.registrationCount}
          captainIntentionCount={data.captainIntentionCount}
        />
      )}

      {data.kind === 'no-tournament' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-[22px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-faint">
            NEXUS · 观测站
          </div>
          <div
            className="font-serif italic text-nexus-ink text-center"
            style={{ fontSize: 28 }}
          >
            暂无活跃赛事
          </div>
          <div className="font-mono text-[11px] text-nexus-dim">
            管理员可登录后台创建赛事
          </div>
        </div>
      )}
    </PublicShell>
  );
}
