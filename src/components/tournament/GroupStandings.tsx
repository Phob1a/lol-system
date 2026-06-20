'use client';

import Link from 'next/link';
import type { PublicState } from '@/hooks/useTournamentState';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Readout from '@/components/nexus/Readout';
import Chip from '@/components/nexus/Chip';

type Standings = NonNullable<PublicState>['standings'];

type Props = {
  standings: Standings;
};

const COL_HEADERS = ['#', '队伍', '场次', '胜', '负', '积分'] as const;

export function GroupStandings({ standings }: Props) {
  if (standings.length === 0) {
    return (
      <p className="text-nexus-faint text-sm text-center py-8 font-mono">
        暂无小组赛数据
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {standings.map((group, gi) => (
        <Panel key={group.groupId}>
          <PanelHead
            title={group.name + ' · 积分'}
            actions={
              <Readout className="text-[10px] text-nexus-faint">
                GRP-{gi + 1}
              </Readout>
            }
          />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {COL_HEADERS.map((h, k) => (
                  <th
                    key={h}
                    className={[
                      'font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]',
                      'text-nexus-faint',
                      'px-4 py-[9px]',
                      'border-b border-nexus-line',
                      k === 0 || k === 1 ? 'text-left' : 'text-center',
                    ].join(' ')}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const isTop2 = row.rank <= 2;
                const teamName = group.teams[row.teamId] ?? row.teamId;
                return (
                  <tr
                    key={row.teamId}
                    className={[
                      'border-b border-nexus-line/40 last:border-b-0',
                      isTop2 ? 'bg-nexus-accent/[0.06]' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {/* rank */}
                    <td className="px-4 py-[11px]">
                      <Readout
                        className={[
                          'font-bold text-[13px]',
                          isTop2 ? 'text-nexus-accent' : 'text-nexus-faint',
                        ].join(' ')}
                      >
                        {row.rank}
                      </Readout>
                    </td>

                    {/* team name → team page link */}
                    <td className="px-4 py-[11px]">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/tournament/team/${row.teamId}`}
                          className="font-body text-[13.5px] text-nexus-ink hover:text-nexus-accent transition-colors duration-100"
                        >
                          {teamName}
                        </Link>
                        {row.tied && (
                          <Chip className="text-[8px]">并列</Chip>
                        )}
                      </div>
                    </td>

                    {/* played */}
                    <td className="px-4 py-[11px] text-center">
                      <Readout className="text-[13px] text-nexus-dim">
                        {row.played}
                      </Readout>
                    </td>

                    {/* wins */}
                    <td className="px-4 py-[11px] text-center">
                      <Readout className="text-[13px] text-nexus-dim">
                        {row.wins}
                      </Readout>
                    </td>

                    {/* losses */}
                    <td className="px-4 py-[11px] text-center">
                      <Readout className="text-[13px] text-nexus-dim">
                        {row.losses}
                      </Readout>
                    </td>

                    {/* points */}
                    <td className="px-4 py-[11px] text-center">
                      <Readout className="text-[13px] text-nexus-ink font-bold">
                        {row.points}
                      </Readout>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}
