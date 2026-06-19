'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PlayerStatsView } from '@/components/tournament/PlayerStatsView';
import type { PlayerTournamentStats } from '@/lib/tournament/player-stats-service';

// 榜单详情复用选手主页组件，profile 即完整的 PlayerTournamentStats。
export type PlayerProfile = PlayerTournamentStats;

type Props = {
  initialProfiles?: PlayerProfile[];
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || name.slice(0, 2).toUpperCase()
  );
}

function metricLabel(profile: PlayerProfile): { value: string; label: string } {
  if (profile.summary.games === 0) return { value: '0', label: '场次' };
  return { value: profile.summary.kda.toString(), label: 'KDA' };
}

function filterProfiles(profiles: PlayerProfile[], query: string): PlayerProfile[] {
  const q = query.trim().toLowerCase();
  if (!q) return profiles;
  return profiles.filter((profile) =>
    [profile.nickname, profile.teamName, profile.primaryPosition]
      .filter(Boolean)
      .some((text) => text!.toLowerCase().includes(q)),
  );
}

function pickDefaultProfile(profiles: PlayerProfile[]): PlayerProfile | null {
  return profiles.find((profile) => profile.summary.games > 0) ?? profiles[0] ?? null;
}

export function LeaderboardView({ initialProfiles }: Props = {}) {
  const [profiles, setProfiles] = useState<PlayerProfile[]>(initialProfiles ?? []);
  const [loading, setLoading] = useState(initialProfiles === undefined);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    pickDefaultProfile(initialProfiles ?? [])?.playerId ?? null,
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tournament/public/leaderboard');
      const body = (await res.json()) as { profiles?: PlayerProfile[] };
      const next = body.profiles ?? [];
      setProfiles(next);
      setSelectedId((current) => current ?? pickDefaultProfile(next)?.playerId ?? null);
    } catch {
      // Leave the last successful data in place.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialProfiles !== undefined) return;
    void fetchData();

    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/tournament/public/stream');
    es.addEventListener('tournament', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string };
        if (data.type === 'tournament.invalidated') void fetchData();
      } catch {
        // ignore malformed frames
      }
    });

    return () => es.close();
  }, [fetchData, initialProfiles]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedId(pickDefaultProfile(profiles)?.playerId ?? null);
      return;
    }
    if (profiles.length > 0 && !profiles.some((profile) => profile.playerId === selectedId)) {
      setSelectedId(pickDefaultProfile(profiles)?.playerId ?? null);
    }
  }, [profiles, selectedId]);

  const filtered = useMemo(() => filterProfiles(profiles, query), [profiles, query]);
  const selected = profiles.find((profile) => profile.playerId === selectedId) ?? pickDefaultProfile(profiles);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-lg border bg-card lg:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="grid grid-flow-col auto-cols-[170px] overflow-x-auto lg:block">
          <div className="w-[170px] shrink-0 border-r p-3 lg:w-auto lg:border-b lg:border-r-0">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索选手 / 队伍 / 位置"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>按综合表现</span>
              <span>{profiles.length} 名</span>
            </div>
          </div>

          {filtered.map((profile) => {
            const metric = metricLabel(profile);
            const active = profile.playerId === selected.playerId;
            return (
              <button
                key={profile.registrationId ?? profile.playerId}
                type="button"
                aria-label={`选择 ${profile.nickname}`}
                onClick={() => setSelectedId(profile.playerId)}
                className={cn(
                  'grid w-[170px] shrink-0 grid-cols-[32px_minmax(0,1fr)] gap-2 border-r p-3 text-left transition hover:bg-muted/50 lg:w-auto lg:grid-cols-[38px_minmax(0,1fr)_auto] lg:border-b lg:border-r-0',
                  active && 'bg-blue-50 ring-2 ring-inset ring-primary',
                )}
              >
                <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-700 text-xs font-bold text-white lg:h-9 lg:w-9">
                  {initials(profile.nickname)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{profile.nickname}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {profile.primaryPosition ?? '位置'} · {profile.teamName ?? '未分队'} · {profile.summary.games} 场
                  </span>
                  <span className="mt-1 flex items-baseline gap-1 text-xs text-muted-foreground lg:hidden">
                    <strong className="text-sm text-foreground">{metric.value}</strong>
                    {metric.label}
                  </span>
                </span>
                <span className="hidden text-right text-xs text-muted-foreground lg:block">
                  <strong className="block text-base leading-none text-foreground">{metric.value}</strong>
                  {metric.label}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0">
        <PlayerStatsView stats={selected} />
      </div>
    </div>
  );
}
