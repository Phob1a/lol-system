'use client';

import type { PlayerCareerHighGame, PlayerTournamentStats } from '@/lib/tournament/player-stats-service';
import { formatDuration, formatNumber, Section } from './shared';

function RecordCard({
  label,
  value,
  game,
}: {
  label: string;
  value: string;
  game?: PlayerCareerHighGame | null;
}) {
  return (
    <div className="rounded-lg border bg-gradient-to-b from-card to-muted/30 p-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl font-extrabold tabular-nums">{value}</strong>
      {game ? (
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {game.championName ?? game.championId} · {game.matchLabel}
        </span>
      ) : null}
    </div>
  );
}

export function PlayerCareerHighs({ stats }: { stats: PlayerTournamentStats }) {
  const { careerHighs } = stats;
  const hasAny =
    careerHighs.maxDamage !== null ||
    careerHighs.maxKills !== null ||
    careerHighs.maxKda !== null ||
    careerHighs.longestTimeSpentLiving !== null;

  return (
    <Section title="生涯纪录" subtitle="赛事内单场之最">
      {!hasAny ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无纪录数据</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RecordCard
            label="单场最高伤害"
            value={careerHighs.maxDamage ? formatNumber(careerHighs.maxDamage.value) : '—'}
            game={careerHighs.maxDamage}
          />
          <RecordCard
            label="单场最多击杀"
            value={careerHighs.maxKills ? `${careerHighs.maxKills.value}` : '—'}
            game={careerHighs.maxKills}
          />
          <RecordCard
            label="单场最高 KDA"
            value={careerHighs.maxKda ? `${careerHighs.maxKda.value}` : '—'}
            game={careerHighs.maxKda}
          />
          <RecordCard label="最长存活" value={formatDuration(careerHighs.longestTimeSpentLiving)} />
        </div>
      )}
    </Section>
  );
}
