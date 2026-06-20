'use client';

/**
 * TodayTimeline — horizontal timeline strip of today's scheduled matches.
 * Ported from docs/design/nexus/prototype/pubextra.jsx TodayTimeline.
 *
 * Each node is clickable and opens the match detail drawer via useMatchDrawer().
 * Falls back to the busiest day when no matches are scheduled for today.
 */

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import { useMatchDrawer } from '@/components/tournament/MatchDetailProvider';
import type { TodayTimelineEntry } from './overview-data';

interface TodayTimelineProps {
  entries: TodayTimelineEntry[];
  /** The date label to display in the panel header (e.g. "06/21") */
  dateLabel?: string;
}

export function TodayTimeline({ entries, dateLabel }: TodayTimelineProps) {
  const { openMatch } = useMatchDrawer();

  if (entries.length === 0) {
    return (
      <Panel>
        <PanelHead title="TODAY · 今日赛程" />
        <div className="px-4 py-6 font-mono text-[11px] text-nexus-faint text-center">
          暂无赛程安排
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead
        title={`TODAY · 今日赛程${dateLabel ? ` · ${dateLabel}` : ''}`}
        actions={
          <span className="font-mono text-[10px] text-nexus-faint">
            {entries.length} 场
          </span>
        }
      />
      <div className="px-3 pb-4 pt-[14px]">
        {/* Timeline track */}
        <div className="relative flex justify-between">
          {/* Horizontal spine — positioned behind the nodes */}
          <div
            className="absolute top-[30px] bg-nexus-line pointer-events-none"
            style={{ left: '6%', right: '6%', height: 2 }}
          />

          {entries.map((entry) => {
            const finished = entry.finished;
            return (
              <button
                key={entry.matchId}
                onClick={() => openMatch(entry.matchId)}
                className="flex-1 flex flex-col items-center relative cursor-pointer min-w-0 px-1 group bg-transparent border-0"
              >
                {/* Time */}
                <span
                  className="font-mono tabular-nums text-[11px] mb-[7px]"
                  style={{
                    color: finished
                      ? 'rgb(var(--accent-n))'
                      : 'rgb(var(--hot))',
                  }}
                >
                  {entry.time}
                </span>

                {/* Node dot */}
                <span
                  className="relative z-10 rounded-full transition-transform group-hover:scale-125"
                  style={{
                    width: 11,
                    height: 11,
                    display: 'inline-block',
                    background: finished
                      ? 'rgb(var(--accent-n))'
                      : 'rgb(var(--panel))',
                    border: `2px solid ${finished ? 'rgb(var(--accent-n))' : 'rgb(var(--hot))'}`,
                    boxShadow: finished
                      ? '0 0 8px rgb(var(--accent-n) / 0.6)'
                      : '0 0 8px rgb(var(--hot) / 0.5)',
                  }}
                />

                {/* Team names */}
                <span
                  className="mt-[11px] font-body text-[11.5px] text-nexus-ink truncate w-full text-center"
                  title={entry.teamAName ?? '待定'}
                >
                  {entry.teamAName
                    ? entry.teamAName.slice(0, 4)
                    : '待定'}
                </span>
                <span className="font-mono text-[9px] text-nexus-faint leading-none">vs</span>
                <span
                  className="font-body text-[11.5px] text-nexus-ink truncate w-full text-center"
                  title={entry.teamBName ?? '待定'}
                >
                  {entry.teamBName
                    ? entry.teamBName.slice(0, 4)
                    : '待定'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
