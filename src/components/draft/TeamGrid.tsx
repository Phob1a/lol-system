import type { DraftTeamSnapshot } from '@/lib/draft/types';
import { TeamCard } from '@/components/draft/TeamCard';

type Props = {
  teams: DraftTeamSnapshot[];
  onTheClockId: string | null;
  maxBudget: number;
};

export function TeamGrid({ teams, onTheClockId, maxBudget }: Props) {
  if (teams.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-12 border border-nexus-line rounded-[var(--radius-nexus)]"
        style={{ background: 'rgb(var(--panel))' }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-faint">
          暂无战队
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          live={onTheClockId !== null && team.captainId === onTheClockId}
          maxBudget={maxBudget}
        />
      ))}
    </div>
  );
}
