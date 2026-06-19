'use client';

import type { PlayerTournamentStats } from '@/lib/tournament/player-stats-service';
import { Section } from './shared';

type Badge = { label: string; hint: string; value: number; icon: string };

function BadgeGrid({ title, badges }: { title: string; badges: Badge[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((badge) => (
          <div
            key={badge.label}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-3"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-500/15 text-lg">{badge.icon}</span>
            <span className="min-w-0">
              <strong className="block truncate text-sm">{badge.label}</strong>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{badge.hint}</span>
            </span>
            <span className="text-2xl font-extrabold tabular-nums">{badge.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerHighlights({ stats }: { stats: PlayerTournamentStats }) {
  const t = stats.extended.totals;

  const rare: Badge[] = [
    { label: '五杀', hint: 'pentaKills', value: t.pentaKills, icon: '👑' },
    { label: '四杀', hint: 'quadraKills', value: t.quadraKills, icon: '🔥' },
    { label: '三杀', hint: 'tripleKills', value: t.tripleKills, icon: '⚔️' },
    { label: '最高连杀', hint: 'largestKillingSpree', value: t.largestKillingSpree ?? 0, icon: '⚡' },
  ];
  const participation: Badge[] = [
    { label: '首杀参与', hint: 'firstBloodKill / Assist', value: t.firstBloodKills + t.firstBloodAssists, icon: '🩸' },
    { label: '首塔参与', hint: 'firstTowerKill / Assist', value: t.firstTowerKills + t.firstTowerAssists, icon: '🏰' },
    { label: '推塔', hint: 'turretKills', value: t.turretKills, icon: '🗼' },
  ];

  return (
    <Section title="累计高光徽章" subtitle="仅累计次数，无事件时间">
      {stats.extended.sourceGames === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无高光事件数据</p>
      ) : (
        <div className="grid gap-4">
          <BadgeGrid title="稀有高光" badges={rare} />
          <BadgeGrid title="参与高光" badges={participation} />
        </div>
      )}
    </Section>
  );
}
