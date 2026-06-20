import type { Position } from '@prisma/client';
import Panel from '@/components/nexus/Panel';
import Kicker from '@/components/nexus/Kicker';
import Chip from '@/components/nexus/Chip';
import LiveDot from '@/components/nexus/LiveDot';
import { PosPip } from '@/components/nexus/PosPip';
import { formatCost } from '@/lib/costs';

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
      <Panel className="p-4">
        <Kicker className="mb-1">选秀状态</Kicker>
        <div className="font-display font-bold text-2xl text-nexus-ink mt-2">
          尚未开始
        </div>
        <div className="font-mono text-[11px] text-nexus-dim mt-1">
          等待管理员开启选秀。
        </div>
      </Panel>
    );
  }

  if (props.status === 'waiting') {
    return (
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Kicker className="mb-1">轮次间隙</Kicker>
            <div className="font-display font-bold text-2xl text-nexus-ink mt-2">
              第 {props.round} 轮已结束
            </div>
            <div className="font-mono text-[11px] text-nexus-dim mt-1">
              等待管理员开启第 {props.round + 1} 轮（共 {props.totalRounds} 轮）
            </div>
          </div>
          <Chip variant="default">等待中</Chip>
        </div>
      </Panel>
    );
  }

  if (props.status === 'completed') {
    return (
      <Panel glow className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Kicker className="mb-1">选秀结果</Kicker>
            <div className="font-display font-bold text-2xl text-nexus-ink mt-2">
              选秀已完成
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip variant="ac">战队 {props.teamCount}</Chip>
            <Chip variant="ac">总出手 {props.totalPicks}</Chip>
          </div>
        </div>
      </Panel>
    );
  }

  // on-the-clock — hot orange left border, glow panel
  return (
    <Panel glow className="overflow-hidden">
      <div
        className="flex items-center justify-between gap-4 flex-wrap p-4"
        style={{ borderLeft: '3px solid rgb(var(--hot))' }}
      >
        <div className="flex items-center gap-3">
          <LiveDot />
          <div>
            <Kicker className="mb-1">
              选秀进行中 · 第 {props.round} 轮
            </Kicker>
            <div
              className="font-display font-bold text-2xl mt-1"
              style={{ color: 'rgb(var(--hot))' }}
            >
              {props.teamName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Chip variant="hot">
            <LiveDot className="w-1.5 h-1.5 mr-0.5" />
            ON THE CLOCK
          </Chip>

          <Chip variant="ac">
            预算 {formatCost(props.budgetLeft)} CR
          </Chip>

          {props.missingPositions.length > 0 && (
            <div className="flex gap-1 items-center">
              {props.missingPositions.map((p) => (
                <PosPip key={p} pos={p} on={false} size={22} />
              ))}
            </div>
          )}

          <span className="font-mono tabular-nums text-[11px] text-nexus-dim">
            已选 {props.pickedCount}/{props.slotCount}
          </span>
        </div>
      </div>
    </Panel>
  );
}
