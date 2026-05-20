import type { DraftTeamSnapshot } from '@/lib/draft/types';
import { TeamCard } from '@/components/draft/TeamCard';

type Props = {
  teams: DraftTeamSnapshot[];
  onTheClockId: string | null;
  maxBudget: number;
};

export function TeamGrid({ teams, onTheClockId, maxBudget }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
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
