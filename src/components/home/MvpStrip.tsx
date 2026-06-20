'use client';

/**
 * MvpStrip — TOP 3 MVP earners panel.
 * Ported from docs/design/nexus/prototype/pubextra.jsx MvpStrip.
 */

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import type { MvpStripEntry } from './overview-data';

const MEDAL_COLORS = [
  'rgb(var(--gold))',
  'rgb(var(--dim))',
  'rgb(var(--hot))',
] as const;

interface MvpStripProps {
  entries: MvpStripEntry[];
}

export function MvpStrip({ entries }: MvpStripProps) {
  return (
    <Panel scan>
      <PanelHead title="MVP · 看板 · TOP 3" />

      {entries.length === 0 ? (
        <div className="px-4 py-6 font-mono text-[11px] text-nexus-faint text-center">
          暂无 MVP 数据
        </div>
      ) : (
        <div className="py-1.5">
          {entries.map((entry, i) => (
            <div
              key={entry.registrationId}
              className="grid items-center gap-[11px] px-4 py-[10px]"
              style={{
                gridTemplateColumns: '24px 1fr auto',
                borderBottom:
                  i < entries.length - 1
                    ? '1px solid rgb(var(--line) / 0.4)'
                    : 'none',
              }}
            >
              {/* Rank medal */}
              <span
                className="font-mono tabular-nums text-[18px] font-bold leading-none"
                style={{ color: MEDAL_COLORS[i] ?? 'rgb(var(--faint))' }}
              >
                {i + 1}
              </span>

              {/* Nickname + team */}
              <div className="min-w-0">
                <div className="font-body text-[14px] text-nexus-ink truncate">
                  {entry.nickname}
                </div>
                {entry.teamName && (
                  <div className="font-mono text-[10px] text-nexus-faint truncate">
                    {entry.teamName}
                  </div>
                )}
              </div>

              {/* MVP star count */}
              <span
                className="font-mono tabular-nums text-[15px] font-bold"
                style={{ color: 'rgb(var(--gold))' }}
              >
                ★ {entry.mvpCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
