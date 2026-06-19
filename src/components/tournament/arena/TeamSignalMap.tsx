import type { ArenaStats, PublicTournamentState } from '@/lib/tournament/arena-view-model';

type TeamSignalMapProps = {
  state: PublicTournamentState;
  stats: ArenaStats;
};

export function TeamSignalMap({ state, stats }: TeamSignalMapProps) {
  const teamNames = Array.from(
    new Set(
      state.matches.flatMap((match) => [match.teamA?.name, match.teamB?.name]).filter((name): name is string => Boolean(name)),
    ),
  ).slice(0, 6);
  const points = ['160,32', '266,92', '266,212', '160,272', '54,212', '54,92'];

  return (
    <section className="arena-panel arena-corner relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            TEAM SIGNAL MAP
          </p>
          <h3 className="mt-2 text-xl font-bold text-white">赛事信号图</h3>
        </div>
        <span className="rounded border border-cyan-200/20 px-2 py-1 text-xs text-cyan-100">
          {stats.teamCount} TEAMS
        </span>
      </div>

      <svg
        viewBox="0 0 320 300"
        className="mt-4 h-56 w-full text-cyan-200"
        role="img"
        aria-label="赛事信号图"
      >
        <polygon points={points.join(' ')} fill="rgba(94, 231, 255, 0.08)" stroke="rgba(94, 231, 255, 0.4)" />
        <polygon points="160,70 230,110 218,198 160,236 102,198 90,110" fill="rgba(246, 195, 95, 0.12)" stroke="rgba(246, 195, 95, 0.55)" />
        <line x1="160" y1="32" x2="160" y2="272" stroke="rgba(255,255,255,0.12)" />
        <line x1="54" y1="92" x2="266" y2="212" stroke="rgba(255,255,255,0.12)" />
        <line x1="266" y1="92" x2="54" y2="212" stroke="rgba(255,255,255,0.12)" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(',');

          return <circle key={point} cx={cx} cy={cy} r={4 + index} fill="currentColor" opacity={0.9 - index * 0.08} />;
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-2">
        {(teamNames.length > 0 ? teamNames : ['等待队伍同步']).map((name) => (
          <span key={name} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
