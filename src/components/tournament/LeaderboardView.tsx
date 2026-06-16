'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { championIconUrl } from '@/lib/tournament/champions';
import { cn } from '@/lib/utils';

export type PlayerGameRow = {
  gameId: string;
  matchId: string;
  matchLabel: string;
  opponent: string;
  championId: string;
  championName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  gold: number;
  win: boolean;
  isMvp: boolean;
};

export type PlayerChampionSummary = {
  championId: string;
  championName: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  avgDamage: number;
};

export type PlayerProfile = {
  registrationId: string | null;
  playerId: string;
  nickname: string;
  teamName: string | null;
  primaryPosition: string | null;
  summary: {
    games: number;
    wins: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    kda: number;
    avgCs: number;
    avgDamage: number;
    avgGold: number;
    mvpCount: number;
  };
  recentForm: boolean[];
  commonChampions: PlayerChampionSummary[];
  games: PlayerGameRow[];
};

type Props = {
  initialProfiles?: PlayerProfile[];
};

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 0)}K`;
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || name.slice(0, 2).toUpperCase();
}

function ChampionIcon({
  championId,
  championName,
}: {
  championId: string;
  championName: string | null;
}) {
  const [errored, setErrored] = useState(false);
  if (!championId || errored) {
    return (
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-700 text-xs font-bold text-white">
        {(championName ?? championId).slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(championId)}
      alt={championName ?? championId}
      width={40}
      height={40}
      className="h-10 w-10 rounded-lg object-cover"
      onError={() => setErrored(true)}
    />
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
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-lg border bg-card lg:block">
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

      <div className="grid min-w-0 gap-4">
        <section className="rounded-lg border bg-gradient-to-br from-slate-800 to-slate-600 p-4 text-white md:p-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
            <div className="flex min-w-0 gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-white/35 bg-white/15 text-2xl font-extrabold md:h-24 md:w-24 md:text-3xl">
                {initials(selected.nickname)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-3xl font-extrabold leading-tight md:text-4xl">
                  {selected.nickname}
                </h2>
                <p className="mt-2 text-sm text-white/80">稳定收割型选手 · 近期状态由最近比赛自动生成</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">
                    {selected.teamName ?? '未分队'}
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">
                    {selected.primaryPosition ?? '位置未填'}
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">
                    代表英雄：{selected.commonChampions[0]?.championName ?? selected.commonChampions[0]?.championId ?? '暂无'}
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">
                    最近 {selected.recentForm.length} 场 {selected.recentForm.filter(Boolean).length} 胜
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/25 bg-white/15 p-3 xl:block">
              <HeroMetric label="胜率" value={formatPercent(selected.summary.winRate)} />
              <HeroMetric label="场均 KDA" value={selected.summary.kda} />
              <HeroMetric label="MVP" value={selected.summary.mvpCount} />
            </div>

            <div className="xl:col-span-2 rounded-lg border border-white/25 bg-white/15 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <h3 className="text-sm font-bold">最近 8 场走势</h3>
                  <p className="mt-1 text-xs text-white/75">红绿缩略条快速表达近期状态。</p>
                </div>
                <div className="grid grid-cols-8 gap-1.5" aria-label="最近 8 场走势">
                  {(selected.recentForm.length > 0 ? selected.recentForm : [false]).map((win, index) => (
                    <span
                      key={`${win}-${index}`}
                      className={cn(
                        'grid h-8 min-w-8 place-items-center rounded-md text-xs font-extrabold text-white',
                        win ? 'bg-emerald-600' : 'bg-rose-500',
                      )}
                    >
                      {win ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">核心数据</h3>
            <span className="text-xs text-muted-foreground">保留榜单可比性</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="场次" value={selected.summary.games} hint="完整数据局" />
            <StatCard
              label="场均 K / D / A"
              value={`${selected.summary.avgKills} / ${selected.summary.avgDeaths} / ${selected.summary.avgAssists}`}
              hint={`KDA ${selected.summary.kda}`}
            />
            <StatCard label="场均伤害" value={formatNumber(selected.summary.avgDamage)} hint="主要输出指标" />
            <StatCard label="场均金币" value={formatNumber(selected.summary.avgGold)} hint="发育效率指标" />
            <StatCard label="场均补刀" value={selected.summary.avgCs} hint="对线与运营指标" />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">常用英雄</h3>
              <span className="text-xs text-muted-foreground">主页感的代表作</span>
            </div>
            <div className="grid gap-2">
              {selected.commonChampions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无英雄数据</p>
              ) : (
                selected.commonChampions.slice(0, 5).map((champion) => (
                  <div
                    key={champion.championId}
                    className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-2"
                  >
                    <ChampionIcon championId={champion.championId} championName={champion.championName} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {champion.championName ?? champion.championId}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {champion.games} 场 · {formatPercent(champion.winRate)} 胜率 · KDA {champion.kda}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <strong className="block text-base leading-none text-foreground">{champion.games}</strong>
                      场
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">最近比赛记录</h3>
              <span className="text-xs text-muted-foreground">保留 V1 查数效率</span>
            </div>
            <RecentGamesTable games={selected.games} />
          </section>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-white/20 py-1 xl:flex xl:items-baseline xl:justify-between xl:border-t xl:py-3 first:xl:border-t-0">
      <div className="text-xs text-white/75">{label}</div>
      <div className="mt-1 text-xl font-extrabold leading-none xl:mt-0">{value}</div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function RecentGamesTable({ games }: { games: PlayerGameRow[] }) {
  if (games.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">暂无比赛记录</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 pr-3 text-left font-semibold">结果</th>
            <th className="py-2 pr-3 text-left font-semibold">比赛</th>
            <th className="py-2 pr-3 text-left font-semibold">对手</th>
            <th className="py-2 pr-3 text-left font-semibold">英雄</th>
            <th className="py-2 pr-3 text-left font-semibold">K / D / A</th>
            <th className="py-2 pr-3 text-left font-semibold">伤害</th>
            <th className="py-2 pr-3 text-left font-semibold">金币</th>
            <th className="py-2 pr-3 text-left font-semibold">标记</th>
            <th className="py-2 text-left font-semibold">详情</th>
          </tr>
        </thead>
        <tbody>
          {games.slice(0, 8).map((game) => (
            <tr key={game.gameId} className="border-b transition-colors hover:bg-muted/40 last:border-b-0">
              <td className="py-2 pr-3">
                <Badge variant={game.win ? 'default' : 'secondary'} className={cn(game.win ? 'bg-emerald-600' : 'bg-rose-500 text-white')}>
                  {game.win ? '胜' : '负'}
                </Badge>
              </td>
              <td className="py-2 pr-3 font-medium">
                <Link href={`/tournament/match/${game.matchId}`} className="hover:underline">
                  {game.matchLabel}
                </Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{game.opponent}</td>
              <td className="py-2 pr-3">{game.championName ?? game.championId}</td>
              <td className="py-2 pr-3 tabular-nums">
                {game.kills} / {game.deaths} / {game.assists}
              </td>
              <td className="py-2 pr-3 tabular-nums">{game.damage.toLocaleString()}</td>
              <td className="py-2 pr-3 tabular-nums">{game.gold.toLocaleString()}</td>
              <td className="py-2 pr-3">
                {game.isMvp ? (
                  <Badge variant="secondary" className="bg-amber-600 text-white">
                    MVP
                  </Badge>
                ) : null}
              </td>
              <td className="py-2">
                <Link
                  href={`/tournament/match/${game.matchId}`}
                  aria-label={`查看 ${game.matchLabel}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  查看
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
