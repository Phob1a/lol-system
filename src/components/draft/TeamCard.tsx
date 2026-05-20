import type { DraftTeamSnapshot } from '@/lib/draft/types';

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
const POSITION_LABEL: Record<string, string> = {
  TOP: '上',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUPPORT: '辅',
};

type Props = {
  team: DraftTeamSnapshot;
  live: boolean;
  maxBudget: number;
};

export function TeamCard({ team, live, maxBudget }: Props) {
  const filledSlots = new Set(
    team.slots.filter((s) => s.registration !== null).map((s) => s.position),
  );

  const budgetPct = Math.min(100, Math.max(0, (team.budgetLeft / (maxBudget > 0 ? maxBudget : 1)) * 100));

  return (
    <div
      className={[
        'rounded-md border px-3 py-2 bg-slate-900/70 transition-all',
        live
          ? 'border-cyan-400/70 ring-2 ring-cyan-400/30 bg-cyan-950/40'
          : 'border-slate-700/50',
      ].join(' ')}
    >
      {/* Team name */}
      <div className="flex items-baseline justify-between gap-1 mb-2">
        <span
          className={[
            'text-sm font-semibold truncate',
            live ? 'text-cyan-300' : 'text-slate-200',
          ].join(' ')}
        >
          {team.captainNickname}
        </span>
        {live && (
          <span className="shrink-0 text-[9px] font-mono tracking-widest text-cyan-400 uppercase">
            ON CLOCK
          </span>
        )}
      </div>

      {/* Position dots */}
      <div className="flex gap-1 mb-2">
        {POSITIONS.map((pos) => {
          const filled = filledSlots.has(pos);
          return (
            <span
              key={pos}
              title={pos}
              className={[
                'flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold border',
                filled
                  ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-300'
                  : 'bg-slate-800/40 border-slate-600/30 text-slate-600',
              ].join(' ')}
            >
              {POSITION_LABEL[pos]}
            </span>
          );
        })}
      </div>

      {/* Budget bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all',
              budgetPct > 50 ? 'bg-amber-400' : budgetPct > 20 ? 'bg-amber-500' : 'bg-rose-500',
            ].join(' ')}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-amber-300/80 shrink-0">{team.budgetLeft}</span>
      </div>
    </div>
  );
}
