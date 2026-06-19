import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type TeamTelemetryPanelProps = {
  standings: PublicTournamentState['standings'];
};

export function TeamTelemetryPanel({ standings }: TeamTelemetryPanelProps) {
  const rows = standings
    .flatMap((group) =>
      group.rows.slice(0, 3).map((row) => ({
        id: `${group.groupId}-${row.teamId}`,
        group: group.name,
        name: group.teams[row.teamId] ?? '未知队伍',
        wins: row.wins,
        points: row.points,
        rank: row.rank,
      })),
    )
    .slice(0, 6);
  const displayRows =
    rows.length > 0
      ? rows
      : [{ id: 'empty', group: '等待同步', name: '暂无积分数据', wins: 0, points: 0, rank: 0 }];

  return (
    <section className="arena-panel arena-corner p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
        TEAM TELEMETRY
      </p>
      <div className="mt-4 space-y-3">
        {displayRows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{row.name}</p>
              <p className="text-xs text-slate-400">
                {row.group} · Rank {row.rank || '-'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-amber-100">{row.points}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{row.wins}W</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
