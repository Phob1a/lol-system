import type { Position } from '@prisma/client';

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
      <div className="flex items-center justify-center rounded-lg bg-muted/30 border border-border px-6 py-8">
        <span className="text-muted-foreground text-lg font-medium tracking-wide">选秀未进行</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg bg-gradient-to-br from-cyan-950/80 to-slate-900/90 border border-cyan-500/40 px-6 py-5 shadow-lg shadow-cyan-950/40">
      {/* Round label */}
      <div className="text-xs font-mono tracking-widest text-cyan-400/70 uppercase mb-1">
        第 {round} 轮
      </div>

      {/* Team name — prominent */}
      <div className="text-3xl font-bold text-cyan-300 tracking-tight truncate mb-4">
        {teamName}
      </div>

      {/* Pill row */}
      <div className="flex flex-wrap gap-2">
        {budgetLeft !== null && (
          <span className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-400/40 px-3 py-0.5 text-xs font-mono text-amber-300">
            预算&nbsp;{budgetLeft}
          </span>
        )}

        {missingPositions.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-rose-500/20 border border-rose-400/40 px-3 py-0.5 text-xs font-mono text-rose-300">
            待补&nbsp;{missingPositions.map((p) => POSITION_LABEL[p]).join('·')}
          </span>
        )}

        <span className="inline-flex items-center rounded-full bg-slate-500/20 border border-slate-400/40 px-3 py-0.5 text-xs font-mono text-slate-300">
          已选&nbsp;{pickedCount}/{slotCount}
        </span>
      </div>
    </div>
  );
}
