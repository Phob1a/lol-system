'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { PublicState } from '@/hooks/useTournamentState';

type Match = NonNullable<PublicState>['matches'][number];

type Props = {
  matches: Match[];
};

function getDateKey(scheduledAt: string | null): string {
  if (!scheduledAt) return '时间待定';
  return new Date(scheduledAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function StatusBadge({ match }: { match: Match }) {
  if (match.isWalkover || match.status === 'WALKOVER') {
    return <Badge variant="secondary">轮空</Badge>;
  }
  if (match.status === 'CANCELED') {
    return (
      <span className="line-through text-muted-foreground text-sm">已取消</span>
    );
  }
  if (match.status === 'FINISHED') {
    const winnerName =
      match.winnerTeamId === match.teamA?.id
        ? match.teamA?.name
        : match.teamB?.name;
    return (
      <Badge variant="default">
        {winnerName ?? '待定'} 胜
      </Badge>
    );
  }
  // SCHEDULED or other
  return <Badge variant="outline">BO{match.bestOf}</Badge>;
}

export function ScheduleList({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">暂无赛程</p>
    );
  }

  // Group by date key, preserving order of first occurrence
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = getDateKey(m.scheduledAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([dateKey, groupMatches]) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {dateKey}
          </h3>
          <div className="space-y-2">
            {groupMatches.map((match) => {
              const isCanceled = match.status === 'CANCELED';
              const rowContent = (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {match.scheduledAt && (
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {new Date(match.scheduledAt).toLocaleString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {match.label && (
                      <span className="text-muted-foreground shrink-0">
                        {match.label}
                      </span>
                    )}
                    <span className="font-medium truncate">
                      {match.teamA?.name ?? '待定'}
                    </span>
                    <span className="text-muted-foreground shrink-0">vs</span>
                    <span className="font-medium truncate">
                      {match.teamB?.name ?? '待定'}
                    </span>
                  </div>
                  <div className="shrink-0 ml-4">
                    <StatusBadge match={match} />
                  </div>
                </>
              );

              return isCanceled ? (
                <div
                  key={match.id}
                  className="flex items-center justify-between border rounded-md px-4 py-3 text-sm"
                >
                  {rowContent}
                </div>
              ) : (
                <Link
                  key={match.id}
                  href={`/tournament/match/${match.id}`}
                  className="flex items-center justify-between border rounded-md px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  {rowContent}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
