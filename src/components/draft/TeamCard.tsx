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
        'rounded-lg border bg-card p-3 transition-all',
        live ? 'ring-2 ring-primary' : '',
      ].join(' ')}
    >
      {/* Team name */}
      <div className="flex items-baseline justify-between gap-1 mb-2">
        <span className="text-sm font-semibold truncate">
          {team.captainNickname}
        </span>
        {live && (
          <span className="shrink-0 text-[9px] font-mono tracking-widest uppercase text-primary">
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
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-muted',
              ].join(' ')}
            >
              {POSITION_LABEL[pos]}
            </span>
          );
        })}
      </div>

      {/* Budget bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{team.budgetLeft}</span>
      </div>
    </div>
  );
}
