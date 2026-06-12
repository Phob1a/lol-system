'use client';

import type { PublicState } from '@/hooks/useTournamentState';

type Bracket = NonNullable<PublicState>['bracket'];
type Standings = NonNullable<PublicState>['standings'];
type Matches = NonNullable<PublicState>['matches'];

type Props = {
  bracket: Bracket;
  standings: Standings;
  matches: Matches;
};

const ROUND_LABEL: Record<string, string> = {
  R16: '十六强',
  QF: '四分之一决赛',
  SF: '半决赛',
  FINAL: '决赛',
};

function getRoundLabel(roundKey: string): string {
  return ROUND_LABEL[roundKey] ?? roundKey;
}

export function BracketView({ bracket, standings, matches }: Props) {
  if (bracket.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">暂无对阵数据</p>
    );
  }

  // Build a unified team name map from standings and matches
  const teamNames = new Map<string, string>();

  for (const group of standings) {
    for (const [teamId, teamName] of Object.entries(group.teams)) {
      teamNames.set(teamId, teamName);
    }
  }

  for (const match of matches) {
    if (match.teamA) teamNames.set(match.teamA.id, match.teamA.name);
    if (match.teamB) teamNames.set(match.teamB.id, match.teamB.name);
  }

  function resolveName(teamId: string | null): string {
    if (!teamId) return '待定';
    return teamNames.get(teamId) ?? '待定';
  }

  return (
    <div className="flex gap-8 overflow-x-auto pb-4">
      {bracket.map((round) => (
        <div key={round.roundKey} className="flex flex-col gap-4 min-w-[180px]">
          <h3 className="text-sm font-semibold text-center text-muted-foreground pb-1 border-b">
            {getRoundLabel(round.roundKey)}
          </h3>
          <div className="flex flex-col gap-3">
            {round.matches.map((m) => {
              const teamAName = resolveName(m.teamAId);
              const teamBName = resolveName(m.teamBId);
              const aIsWinner =
                m.winnerTeamId !== null && m.winnerTeamId === m.teamAId;
              const bIsWinner =
                m.winnerTeamId !== null && m.winnerTeamId === m.teamBId;

              return (
                <div
                  key={m.id}
                  className="border rounded-md overflow-hidden text-sm"
                >
                  {m.label && (
                    <div className="px-3 py-1 bg-muted/50 text-muted-foreground text-xs border-b">
                      {m.label}
                    </div>
                  )}
                  <div
                    className={[
                      'px-3 py-2 border-b',
                      aIsWinner ? 'font-bold text-primary' : 'text-foreground',
                    ].join(' ')}
                  >
                    {teamAName}
                  </div>
                  <div
                    className={[
                      'px-3 py-2',
                      bIsWinner ? 'font-bold text-primary' : 'text-foreground',
                    ].join(' ')}
                  >
                    {teamBName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
