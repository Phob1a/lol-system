import type { DraftTeamSnapshot } from '@/lib/draft/types';
import { TeamHoverCard, type TeamHoverSummary } from '@/components/draft/TeamHoverCard';
import Panel from '@/components/nexus/Panel';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import { PosPip } from '@/components/nexus/PosPip';
import { SegBudget } from '@/components/nexus/charts/SegBudget';
import { formatCost } from '@/lib/costs';

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

type Props = {
  team: DraftTeamSnapshot;
  live: boolean;
  maxBudget: number;
};

export function TeamCard({ team, live, maxBudget }: Props) {
  const filledCount = team.slots.filter((s) => s.registration !== null).length;

  const hoverTeam: TeamHoverSummary = {
    captainNickname: team.captainNickname,
    captainGameId: team.captainGameId,
    budgetLeft: team.budgetLeft,
    slots: team.slots.map((slot) => ({
      position: slot.position,
      player: slot.registration,
    })),
  };

  return (
    <TeamHoverCard team={hoverTeam}>
      <Panel
        glow={live}
        className="p-[14px]"
        style={
          live
            ? { borderColor: 'rgb(var(--hot) / 0.6)' }
            : undefined
        }
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <div
              className="font-display font-semibold text-[14.5px] leading-tight truncate"
              style={{ color: live ? 'rgb(var(--hot))' : 'rgb(var(--ink))' }}
            >
              {team.captainNickname}
            </div>
            <Kicker className="mt-0.5">
              队长 · {filledCount}/5
            </Kicker>
          </div>
          {live && <Chip variant="hot">选择中</Chip>}
        </div>

        {/* Position pips + player nicknames */}
        <div className="flex gap-[6px] mb-2.5">
          {POSITIONS.map((pos) => {
            const slot = team.slots.find((s) => s.position === pos);
            const filled = !!slot?.registration;
            return (
              <div key={pos} className="flex-1 text-center">
                <PosPip pos={pos} on={filled} size={28} />
                <div
                  className="font-mono text-[8.5px] mt-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    color: filled ? 'rgb(var(--dim))' : 'rgb(var(--faint))',
                  }}
                >
                  {slot?.registration
                    ? slot.registration.nickname.slice(0, 4)
                    : '空'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Budget bar */}
        <div className="flex items-center justify-between mb-1.5">
          <Kicker>预算余额</Kicker>
          <span
            className="font-mono tabular-nums text-[11px]"
            style={{ color: 'rgb(var(--accent-n))' }}
          >
            {formatCost(team.budgetLeft)}
          </span>
        </div>
        <SegBudget used={team.budgetLeft} total={maxBudget > 0 ? maxBudget : 1} segs={20} />
      </Panel>
    </TeamHoverCard>
  );
}
