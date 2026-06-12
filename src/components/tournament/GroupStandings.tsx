'use client';

import type { PublicState } from '@/hooks/useTournamentState';

type Standings = NonNullable<PublicState>['standings'];

type Props = {
  standings: Standings;
};

export function GroupStandings({ standings }: Props) {
  if (standings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">暂无小组赛数据</p>
    );
  }

  return (
    <div className="space-y-8">
      {standings.map((group) => (
        <div key={group.groupId}>
          <h3 className="text-sm font-semibold mb-3">{group.name}</h3>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left text-muted-foreground font-medium w-12">
                    排名
                  </th>
                  <th className="px-4 py-2 text-left text-muted-foreground font-medium">
                    队伍
                  </th>
                  <th className="px-4 py-2 text-center text-muted-foreground font-medium w-16">
                    场次
                  </th>
                  <th className="px-4 py-2 text-center text-muted-foreground font-medium w-12">
                    胜
                  </th>
                  <th className="px-4 py-2 text-center text-muted-foreground font-medium w-12">
                    负
                  </th>
                  <th className="px-4 py-2 text-center text-muted-foreground font-medium w-12">
                    积分
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr
                    key={row.teamId}
                    className={[
                      'border-b last:border-0',
                      row.tied ? 'bg-amber-500/10' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="px-4 py-2 tabular-nums text-center font-medium">
                      {row.rank}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span>{group.teams[row.teamId] ?? row.teamId}</span>
                        {row.tied && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            并列待加赛
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-center">
                      {row.played}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-center">
                      {row.wins}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-center">
                      {row.losses}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-center font-semibold">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
