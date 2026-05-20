import type { Position } from '@prisma/client';
import { Badge } from '@/components/ui/badge';

const POSITION_LABEL: Record<Position, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

type Props = {
  teamName: string | null;
  round: number;
  budgetLeft: number | null;
  missingPositions: Position[];
  pickedCount: number;
  slotCount: number;
};

export function OnTheClockHero({
  teamName,
  round,
  budgetLeft,
  missingPositions,
  pickedCount,
  slotCount,
}: Props) {
  if (teamName === null) {
    return (
      <div className="rounded-lg border bg-muted p-4">
        <span className="text-muted-foreground text-lg font-medium tracking-wide">选秀未进行</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border bg-primary text-primary-foreground p-4">
      {/* Round label */}
      <div className="text-xs font-mono tracking-widest uppercase mb-1 opacity-70">
        第 {round} 轮
      </div>

      {/* Team name — prominent */}
      <div className="text-3xl font-bold tracking-tight truncate mb-4">
        {teamName}
      </div>

      {/* Pill row */}
      <div className="flex flex-wrap gap-2">
        {budgetLeft !== null && (
          <Badge variant="secondary">
            预算&nbsp;{budgetLeft}
          </Badge>
        )}

        {missingPositions.length > 0 && (
          <Badge variant="secondary">
            待补&nbsp;{missingPositions.map((p) => POSITION_LABEL[p]).join('·')}
          </Badge>
        )}

        <Badge variant="secondary">
          已选&nbsp;{pickedCount}/{slotCount}
        </Badge>
      </div>
    </div>
  );
}
