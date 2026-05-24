import type { Position } from '@prisma/client';
import { Badge } from '@/components/ui/badge';

const POSITION_LABEL: Record<Position, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

// Discriminated by `status` so each lifecycle stage owns its own fields and
// callers can't accidentally render a half-populated hero (e.g. drawing the
// on-the-clock card with teamName=null, which used to fall through to the
// generic "draft not running" copy).
export type HeroStatus =
  | { status: 'pending' }
  | { status: 'waiting'; round: number; totalRounds: number }
  | {
      status: 'on-the-clock';
      teamName: string;
      round: number;
      budgetLeft: number;
      missingPositions: Position[];
      pickedCount: number;
      slotCount: number;
    }
  | { status: 'completed'; teamCount: number; totalPicks: number };

export function OnTheClockHero(props: HeroStatus) {
  if (props.status === 'pending') {
    return (
      <div className="rounded-lg border bg-muted p-4">
        <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground mb-1">
          选秀状态
        </div>
        <div className="text-lg font-medium text-foreground">尚未开始</div>
        <div className="text-sm text-muted-foreground mt-1">
          等待管理员开启选秀。
        </div>
      </div>
    );
  }

  if (props.status === 'waiting') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
        <div className="text-xs font-mono tracking-widest uppercase text-amber-800 dark:text-amber-300 mb-1">
          轮次间隙
        </div>
        <div className="text-lg font-medium text-amber-900 dark:text-amber-100">
          第 {props.round} 轮已结束
        </div>
        <div className="text-sm text-amber-700 dark:text-amber-200 mt-1">
          等待管理员开启第 {props.round + 1} 轮（共 {props.totalRounds} 轮）。
        </div>
      </div>
    );
  }

  if (props.status === 'completed') {
    return (
      <div className="rounded-lg border bg-violet-600 text-violet-50 p-4 dark:bg-violet-700">
        <div className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">
          选秀结果
        </div>
        <div className="text-2xl font-bold tracking-tight mb-3">选秀已完成</div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">战队&nbsp;{props.teamCount}</Badge>
          <Badge variant="secondary">总出手&nbsp;{props.totalPicks}</Badge>
        </div>
      </div>
    );
  }

  // on-the-clock
  return (
    <div className="relative rounded-lg border bg-primary text-primary-foreground p-4">
      <div className="text-xs font-mono tracking-widest uppercase mb-1 opacity-70">
        第 {props.round} 轮
      </div>

      <div className="text-3xl font-bold tracking-tight truncate mb-4">
        {props.teamName}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">预算&nbsp;{props.budgetLeft}</Badge>

        {props.missingPositions.length > 0 && (
          <Badge variant="secondary">
            待补&nbsp;{props.missingPositions.map((p) => POSITION_LABEL[p]).join('·')}
          </Badge>
        )}

        <Badge variant="secondary">
          已选&nbsp;{props.pickedCount}/{props.slotCount}
        </Badge>
      </div>
    </div>
  );
}
