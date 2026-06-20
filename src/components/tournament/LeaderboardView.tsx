'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { championIconUrl } from '@/lib/tournament/champions';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import Kicker from '@/components/nexus/Kicker';
import DTile from '@/components/nexus/DTile';

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
      <span className="grid h-10 w-10 place-items-center bg-nexus-panel-2 border border-nexus-line rounded-[var(--radius-nexus)] font-mono text-[10px] text-nexus-faint">
        {(championName ?? championId).slice(0, 3).toUpperCase()}
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
      className="h-10 w-10 rounded-[var(--radius-nexus)] object-cover border border-nexus-line/60"
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
        <Kicker className="animate-pulse">加载中…</Kicker>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-nexus-faint text-sm font-mono">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[268px_minmax(0,1fr)]">
      {/* Sidebar catalogue */}
      <Panel className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto overflow-hidden">
        <div className="grid grid-flow-col auto-cols-[160px] overflow-x-auto lg:block">
          {/* search + count */}
          <div className="w-[160px] shrink-0 border-r border-nexus-line p-3 lg:w-auto lg:border-b lg:border-r-0">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索选手 / 队伍 / 位置"
              className={[
                'h-8 w-full px-3',
                'bg-nexus-panel-2 border border-nexus-line',
                'font-mono text-[11px] text-nexus-ink placeholder:text-nexus-faint',
                'rounded-[var(--radius-nexus)]',
                'outline-none focus:border-nexus-accent/60',
                'transition-colors duration-100',
              ].join(' ')}
            />
            <div className="mt-2 flex justify-between">
              <Kicker>按综合表现</Kicker>
              <Readout className="text-[10px] text-nexus-faint">{profiles.length} 名</Readout>
            </div>
          </div>

          {/* player rows */}
          {filtered.map((profile) => {
            const metric = metricLabel(profile);
            const isActive = profile.playerId === selected.playerId;
            return (
              <button
                key={profile.registrationId ?? profile.playerId}
                type="button"
                aria-label={`选择 ${profile.nickname}`}
                onClick={() => setSelectedId(profile.playerId)}
                className={[
                  'grid w-[160px] shrink-0 grid-cols-[30px_minmax(0,1fr)] gap-2',
                  'border-r border-nexus-line p-3 text-left',
                  'transition-colors duration-100',
                  'lg:w-auto lg:grid-cols-[36px_minmax(0,1fr)_auto] lg:border-b lg:border-r-0',
                  isActive
                    ? 'bg-nexus-accent/10 border-l-2 border-l-nexus-accent'
                    : 'hover:bg-nexus-panel-2/60',
                ].join(' ')}
              >
                <span className="grid h-[30px] w-[30px] place-items-center bg-nexus-panel-2 border border-nexus-line font-mono text-[10px] font-bold text-nexus-ink rounded-[var(--radius-nexus)] lg:h-[36px] lg:w-[36px]">
                  {initials(profile.nickname)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-body text-[13px] text-nexus-ink">
                    {profile.nickname}
                  </span>
                  <Kicker className="block mt-0.5 truncate">
                    {profile.primaryPosition ?? '位置'} · {profile.teamName ?? '未分队'} · {profile.summary.games} 场
                  </Kicker>
                  <span className="mt-1 flex items-baseline gap-1 lg:hidden">
                    <Readout className="text-[13px] text-nexus-accent font-bold">{metric.value}</Readout>
                    <Kicker>{metric.label}</Kicker>
                  </span>
                </span>
                <span className="hidden lg:block text-right">
                  <Readout className="block text-[15px] font-bold text-nexus-accent leading-none">{metric.value}</Readout>
                  <Kicker>{metric.label}</Kicker>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Detail pane */}
      <div className="grid min-w-0 gap-4">
        {/* Hero banner */}
        <Panel glow className="p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            {/* identity */}
            <div className="flex min-w-0 gap-4 items-start">
              <div className="grid h-20 w-20 shrink-0 place-items-center bg-nexus-panel-2 border border-nexus-line rounded-[var(--radius-nexus)] font-display text-2xl font-bold text-nexus-ink md:h-24 md:w-24 md:text-3xl">
                {initials(selected.nickname)}
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-3xl font-bold uppercase leading-none text-nexus-ink md:text-4xl truncate">
                  {selected.nickname}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip variant="ac">{selected.teamName ?? '未分队'}</Chip>
                  <Chip>{selected.primaryPosition ?? '位置未填'}</Chip>
                  <Chip>
                    代表：
                    {selected.commonChampions[0]?.championName ??
                      selected.commonChampions[0]?.championId ??
                      '暂无'}
                  </Chip>
                  <Chip>
                    近 {selected.recentForm.length} 场&nbsp;
                    {selected.recentForm.filter(Boolean).length} 胜
                  </Chip>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="flex gap-2 flex-wrap xl:flex-col xl:justify-between xl:border-l xl:border-nexus-line xl:pl-4">
              <HeroMetric label="胜率" value={formatPercent(selected.summary.winRate)} />
              <HeroMetric label="场均 KDA" value={selected.summary.kda} />
              <HeroMetric label="MVP" value={selected.summary.mvpCount} />
            </div>

            {/* Recent form strip */}
            <div className="xl:col-span-2 bg-nexus-panel-2 border border-nexus-line rounded-[var(--radius-nexus)] p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <Kicker as="p" className="mb-1">最近 {Math.min(8, selected.recentForm.length)} 场走势</Kicker>
                </div>
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${Math.min(8, selected.recentForm.length) || 1}, minmax(0, 1fr))` }}
                  aria-label="最近 8 场走势"
                >
                  {(selected.recentForm.length > 0
                    ? selected.recentForm.slice(0, 8)
                    : [false]
                  ).map((win, index) => (
                    <span
                      key={`${win}-${index}`}
                      className={[
                        'grid h-8 min-w-[2rem] place-items-center',
                        'rounded-[var(--radius-nexus)]',
                        'font-mono text-[11px] font-bold',
                        win
                          ? 'bg-nexus-good/20 text-nexus-good border border-nexus-good/40'
                          : 'bg-nexus-bad/20 text-nexus-bad border border-nexus-bad/40',
                      ].join(' ')}
                    >
                      {win ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Core stats tiles */}
        <Panel>
          <PanelHead
            title="核心数据"
            actions={<Kicker>LEAD-01</Kicker>}
          />
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-5">
            <DTile
              label="场次"
              value={selected.summary.games}
              sub="完整数据局"
            />
            <DTile
              label="场均 K / D / A"
              value={`${selected.summary.avgKills}/${selected.summary.avgDeaths}/${selected.summary.avgAssists}`}
              sub={`KDA ${selected.summary.kda}`}
            />
            <DTile
              label="场均伤害"
              value={formatNumber(selected.summary.avgDamage)}
              sub="主要输出指标"
            />
            <DTile
              label="场均金币"
              value={formatNumber(selected.summary.avgGold)}
              sub="发育效率指标"
            />
            <DTile
              label="场均补刀"
              value={selected.summary.avgCs}
              sub="对线与运营"
            />
          </div>
        </Panel>

        {/* Champions + Recent games */}
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <Panel>
            <PanelHead title="常用英雄" />
            <div className="grid gap-2 p-3">
              {selected.commonChampions.length === 0 ? (
                <p className="py-6 text-center text-nexus-faint text-sm font-mono">暂无英雄数据</p>
              ) : (
                selected.commonChampions.slice(0, 5).map((champion) => (
                  <div
                    key={champion.championId}
                    className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 bg-nexus-panel-2 border border-nexus-line rounded-[var(--radius-nexus)] px-3 py-2"
                  >
                    <ChampionIcon championId={champion.championId} championName={champion.championName} />
                    <div className="min-w-0">
                      <div className="truncate font-body text-[13px] text-nexus-ink">
                        {champion.championName ?? champion.championId}
                      </div>
                      <Kicker className="block mt-0.5 truncate">
                        {champion.games} 场 · {formatPercent(champion.winRate)} 胜率 · KDA {champion.kda}
                      </Kicker>
                    </div>
                    <div className="text-right">
                      <Readout className="block text-[15px] font-bold text-nexus-ink leading-none">{champion.games}</Readout>
                      <Kicker>场</Kicker>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="最近比赛记录" />
            <RecentGamesTable games={selected.games} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 border-t border-nexus-line/40 first:border-t-0 xl:py-2">
      <Kicker>{label}</Kicker>
      <Readout className="text-[18px] font-bold text-nexus-accent leading-none">{value}</Readout>
    </div>
  );
}

function RecentGamesTable({ games }: { games: PlayerGameRow[] }) {
  if (games.length === 0) {
    return (
      <p className="py-6 text-center text-nexus-faint text-sm font-mono">暂无比赛记录</p>
    );
  }

  const TH_CLASSES =
    'font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-nexus-faint px-3 py-[9px] border-b border-nexus-line text-left';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            {['结果', '比赛', '对手', '英雄', 'K/D/A', '伤害', '金币', '标记'].map((h) => (
              <th key={h} className={TH_CLASSES}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.slice(0, 8).map((game) => (
            <tr
              key={game.gameId}
              className="border-b border-nexus-line/40 transition-colors hover:bg-nexus-panel-2/60 last:border-b-0"
            >
              <td className="px-3 py-[9px]">
                <Chip variant={game.win ? 'good' : 'default'}>
                  {game.win ? '胜' : '负'}
                </Chip>
              </td>
              <td className="px-3 py-[9px]">
                <Link
                  href={`/tournament/match/${game.matchId}`}
                  aria-label={`查看 ${game.matchLabel}`}
                  className="font-body text-[13px] text-nexus-ink hover:text-nexus-accent transition-colors duration-100"
                >
                  {game.matchLabel}
                </Link>
              </td>
              <td className="px-3 py-[9px]">
                <span className="font-body text-[13px] text-nexus-dim">{game.opponent}</span>
              </td>
              <td className="px-3 py-[9px]">
                <span className="font-body text-[13px] text-nexus-ink">
                  {game.championName ?? game.championId}
                </span>
              </td>
              <td className="px-3 py-[9px]">
                <Readout className="text-[12px] text-nexus-ink">
                  {game.kills}&thinsp;/&thinsp;{game.deaths}&thinsp;/&thinsp;{game.assists}
                </Readout>
              </td>
              <td className="px-3 py-[9px]">
                <Readout className="text-[12px] text-nexus-dim">
                  {game.damage.toLocaleString()}
                </Readout>
              </td>
              <td className="px-3 py-[9px]">
                <Readout className="text-[12px] text-nexus-dim">
                  {game.gold.toLocaleString()}
                </Readout>
              </td>
              <td className="px-3 py-[9px]">
                {game.isMvp && (
                  <Chip className="border-nexus-gold/60 text-nexus-gold">MVP</Chip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
