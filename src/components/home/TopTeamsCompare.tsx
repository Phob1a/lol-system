'use client';

/**
 * TopTeamsCompare — 5-axis radar comparing the top two teams.
 * Ported from docs/design/nexus/prototype/pubextra.jsx TopTeamsCompare.
 *
 * When `data` is null (not enough teams/stats) renders a placeholder panel.
 */

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import CompareRadar from '@/components/nexus/charts/CompareRadar';
import type { TopTeamsCompareData } from './overview-data';

const RADAR_LABELS = ['KDA', '胜率', '击杀', '经济', '补刀'] as const;

interface TopTeamsCompareProps {
  data: TopTeamsCompareData;
}

export function TopTeamsCompare({ data }: TopTeamsCompareProps) {
  return (
    <Panel>
      <PanelHead title="VERSUS · 榜首对比 · 战力" />

      {data == null ? (
        <div className="px-4 py-6 font-mono text-[11px] text-nexus-faint text-center">
          对比数据待更新
        </div>
      ) : (
        <div className="p-4 grid place-items-center gap-[10px]">
          <CompareRadar
            a={data.teamAValues}
            b={data.teamBValues}
            labels={[...RADAR_LABELS]}
            size={216}
          />

          {/* Legend */}
          <div className="flex gap-[18px]">
            <LegendItem color="rgb(var(--accent-n))" name={data.teamAName} />
            <LegendItem color="rgb(var(--accent-n2))" name={data.teamBName} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function LegendItem({ color, name }: { color: string; name: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span
        style={{ width: 9, height: 9, background: color, display: 'inline-block', flexShrink: 0 }}
      />
      <span className="font-mono text-[11px] text-nexus-ink">{name}</span>
    </span>
  );
}
