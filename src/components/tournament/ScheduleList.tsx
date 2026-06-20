'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { PublicState } from '@/hooks/useTournamentState';
import { groupMatchesByDay } from '@/lib/tournament/schedule-grouping';

type Match = NonNullable<PublicState>['matches'][number];

type Props = {
  matches: Match[];
};

function formatMatchTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(11, 16);
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
      <p className="py-8 text-center text-sm text-muted-foreground">暂无赛程</p>
    );
  }

  const scheduledMatches = matches.filter((match) => match.scheduledAt !== null);
  if (scheduledMatches.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">暂无已排期比赛</p>
    );
  }

  const groups = groupMatchesByDay<Match>(scheduledMatches);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.dayKey}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {group.label} · {group.count} 场
          </h3>
          <div className="space-y-2">
            {group.matches.map((match) => {
              const isCanceled = match.status === 'CANCELED';
              const rowContent = (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    {match.scheduledAt && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatMatchTime(match.scheduledAt)}
                      </span>
                    )}
                    {match.label && (
                      <span className="shrink-0 text-muted-foreground">
                        {match.label}
                      </span>
                    )}
                    <span className="truncate font-medium text-slate-100">
                      {match.teamA?.name ?? '待定'}
                    </span>
                    <span className="shrink-0 text-muted-foreground">vs</span>
                    <span className="truncate font-medium text-slate-100">
                      {match.teamB?.name ?? '待定'}
                    </span>
                  </div>
                  <div className="ml-4 shrink-0">
                    <StatusBadge match={match} />
                  </div>
                </>
              );

              return isCanceled ? (
                <div
                  key={match.id}
                  className="flex items-center justify-between rounded-md border border-cyan-200/15 bg-slate-950/30 px-4 py-3 text-sm"
                >
                  {rowContent}
                </div>
              ) : (
                <Link
                  key={match.id}
                  href={`/tournament/match/${match.id}`}
                  className="flex items-center justify-between rounded-md border border-cyan-200/15 bg-slate-950/30 px-4 py-3 text-sm transition-colors hover:border-cyan-200/35 hover:bg-cyan-200/10"
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
