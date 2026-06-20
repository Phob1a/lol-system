/**
 * PlayersPage — NEXUS public "选手目录 / Players" screen.
 *
 * Prototype reference: docs/design/nexus/prototype/screens2.jsx → PlayersScreen
 * Route: /players
 *
 * Layout: LEFT catalogue (search + sort + position filter) →
 *         RIGHT 观测档案 (WinDonut, 4 DTiles, PlayerRadar, ChampBars,
 *                         SeasonTrend, game log table).
 *
 * Data: fetches /api/tournament/public/leaderboard (PlayerProfile list).
 *       Radar axes and SeasonTrend are derived from profile.summary +
 *       profile.games already present in the leaderboard payload — no extra
 *       per-player fetch is needed for the catalogue.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Kicker from '@/components/nexus/Kicker';
import Chip from '@/components/nexus/Chip';
import { PosPip } from '@/components/nexus/PosPip';
import { PlayerHoverCard, type PlayerCardData } from '@/components/nexus/HoverCard';

import WinDonut from '@/components/nexus/charts/WinDonut';
import PlayerRadar from '@/components/nexus/charts/PlayerRadar';
import { ChampBars } from '@/components/nexus/charts/ChampBars';
import { SeasonTrend } from '@/components/nexus/charts/SeasonTrend';
import { FormDots } from '@/components/nexus/charts/FormDots';

import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';

// ── Data shapes (subset of PlayerTournamentStats from the API) ─────────────────

type PlayerGameRow = {
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

type PlayerChampionSummary = {
  championId: string;
  championName: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  avgDamage: number;
};

type PlayerProfile = {
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

// ── Sort configuration ─────────────────────────────────────────────────────────

type SortKey = 'kda' | 'winRate' | 'avgDamage' | 'games' | 'avgGold';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'kda',       label: 'KDA'  },
  { key: 'winRate',   label: '胜率'  },
  { key: 'avgDamage', label: '输出'  },
  { key: 'games',     label: '场次'  },
  { key: 'avgGold',   label: '经济'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortValue(p: PlayerProfile, key: SortKey): number {
  const s = p.summary;
  switch (key) {
    case 'kda':       return s.kda;
    case 'winRate':   return s.winRate;
    case 'avgDamage': return s.avgDamage;
    case 'games':     return s.games;
    case 'avgGold':   return s.avgGold;
  }
}

function formatSortCol(p: PlayerProfile, key: SortKey): string {
  const s = p.summary;
  switch (key) {
    case 'kda':       return s.kda.toFixed(2);
    case 'winRate':   return `${s.winRate}%`;
    case 'avgDamage': return `${(s.avgDamage / 1000).toFixed(1)}K`;
    case 'games':     return String(s.games);
    case 'avgGold':   return `${(s.avgGold / 1000).toFixed(1)}K`;
  }
}

function pickDefault(profiles: PlayerProfile[]): PlayerProfile | null {
  return profiles.find((p) => p.summary.games > 0) ?? profiles[0] ?? null;
}

/** Derive 5-axis radar values (0..1) from a player summary. */
function buildRadarAxes(p: PlayerProfile) {
  const s = p.summary;
  return [
    { label: 'KDA',  v: Math.min(1, s.kda / 6) },
    { label: '输出',  v: Math.min(1, s.avgDamage / 36000) },
    { label: '经济',  v: Math.min(1, s.avgGold / 16000) },
    { label: '补刀',  v: Math.min(1, s.avgCs / 300) },
    { label: '胜率',  v: s.winRate / 100 },
  ];
}

/** Build PlayerCardData for HoverCard from a loaded profile. */
function toCardData(p: PlayerProfile): PlayerCardData {
  const pos = (p.primaryPosition ?? 'MID') as PlayerCardData['primaryPosition'];
  const s = p.summary;
  if (s.games === 0) {
    return { nickname: p.nickname, primaryPosition: pos, teamName: p.teamName ?? undefined };
  }
  return {
    nickname: p.nickname,
    primaryPosition: pos,
    teamName: p.teamName ?? undefined,
    recentForm: p.recentForm,
    commonChampions: p.commonChampions.slice(0, 3).map((c) => ({
      championName: c.championName ?? c.championId,
      games: c.games,
    })),
    summary: {
      winRate: s.winRate,
      kda: s.kda.toFixed(2),
      avgKills: s.avgKills,
      avgDeaths: s.avgDeaths,
      avgAssists: s.avgAssists,
      avgDamage: s.avgDamage,
      avgGold: s.avgGold,
      avgCs: s.avgCs,
    },
  };
}

// ── Catalogue (left panel) ─────────────────────────────────────────────────────

interface CatalogueProps {
  profiles: PlayerProfile[];
  filteredList: PlayerProfile[];
  selectedId: string | null;
  sortKey: SortKey;
  posFilter: string;
  query: string;
  onSelect: (id: string) => void;
  onSort: (key: SortKey) => void;
  onPos: (pos: string) => void;
  onQuery: (q: string) => void;
}

function Catalogue({
  profiles,
  filteredList,
  selectedId,
  sortKey,
  posFilter,
  query,
  onSelect,
  onSort,
  onPos,
  onQuery,
}: CatalogueProps) {
  return (
    <Panel style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
      <PanelHead
        title={`CATALOGUE · 选手目录 · ${filteredList.length}`}
        actions={
          <span className="font-mono text-[10px] text-nexus-faint whitespace-nowrap">
            按 {SORT_OPTIONS.find((s) => s.key === sortKey)?.label}
          </span>
        }
      />

      {/* Filters */}
      <div
        style={{
          padding: '10px 12px',
          display: 'grid',
          gap: 8,
          borderBottom: '1px solid rgb(var(--line))',
        }}
      >
        {/* Search input */}
        <input
          className="h-[34px] w-full rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 font-mono text-[13px] text-nexus-ink placeholder:text-nexus-faint outline-none focus:border-nexus-accent/60 transition-colors"
          placeholder="搜索昵称 / 战队…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />

        {/* Sort chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onSort(key)}
              style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            >
              <Chip variant={sortKey === key ? 'ac' : 'default'}>{label}</Chip>
            </button>
          ))}
        </div>

        {/* Position filter chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button
            onClick={() => onPos('ALL')}
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            <Chip variant={posFilter === 'ALL' ? 'ac' : 'default'}>全部</Chip>
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => onPos(pos)}
              style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            >
              <Chip variant={posFilter === pos ? 'ac' : 'default'}>
                {POSITION_LABEL[pos]}
              </Chip>
            </button>
          ))}
        </div>
      </div>

      {/* Player rows */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 560 }}>
        {filteredList.length === 0 ? (
          <div
            className="font-mono text-[11px] text-nexus-faint"
            style={{ padding: 24, textAlign: 'center' }}
          >
            无匹配选手
          </div>
        ) : (
          filteredList.map((p, i) => {
            const isSelected = p.playerId === selectedId;
            const posKey = (p.primaryPosition ?? 'MID') as Parameters<typeof PosPip>[0]['pos'];

            return (
              <PlayerHoverCard key={p.playerId} data={toCardData(p)}>
                <button
                  onClick={() => onSelect(p.playerId)}
                  style={{
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    background: isSelected ? 'rgb(var(--accent-n) / 0.1)' : 'transparent',
                    boxShadow: isSelected ? 'inset 2px 0 0 rgb(var(--accent-n))' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '34px 1fr 48px 72px',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    borderBottom: '1px solid rgb(var(--line) / 0.4)',
                    transition: 'background .12s, box-shadow .12s',
                    textAlign: 'left',
                  }}
                >
                  {/* Rank number */}
                  <span
                    className="font-mono tabular-nums"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: i < 3 ? 'rgb(var(--accent-n))' : 'rgb(var(--faint))',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* Nickname + team */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13.5,
                        color: 'rgb(var(--ink))',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.nickname}
                    </div>
                    <div className="font-mono text-[10px] text-nexus-faint truncate">
                      {p.teamName ?? '未分队'}
                    </div>
                  </div>

                  {/* Position pip */}
                  <PosPip pos={posKey} on={isSelected} size={22} />

                  {/* Sort metric value */}
                  <span
                    className="font-mono tabular-nums text-nexus-accent"
                    style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}
                  >
                    {formatSortCol(p, sortKey)}
                  </span>
                </button>
              </PlayerHoverCard>
            );
          })
        )}
      </div>

      {/* Footer: total registered count */}
      {profiles.length > 0 && (
        <div
          className="font-mono text-[10px] text-nexus-faint"
          style={{
            padding: '8px 12px',
            borderTop: '1px solid rgb(var(--line) / 0.4)',
          }}
        >
          共 {profiles.length} 名选手
        </div>
      )}
    </Panel>
  );
}

// ── ObservationFile (right panel) ──────────────────────────────────────────────

interface ObservationFileProps {
  profile: PlayerProfile;
}

function ObservationFile({ profile: p }: ObservationFileProps) {
  const s = p.summary;
  const posKey = (p.primaryPosition ?? 'MID') as Parameters<typeof PosPip>[0]['pos'];
  const posLabel = POSITION_LABEL[posKey] ?? posKey;
  const axes = buildRadarAxes(p);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Hero card */}
      <Panel glow style={{ padding: 22 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Kicker style={{ display: 'block', marginBottom: 8 }}>
              OBSERVATION FILE · {p.playerId.toUpperCase().slice(0, 16)}
            </Kicker>

            {/* Team name + position */}
            <div
              className="font-serif italic"
              style={{ fontSize: 15, color: 'rgb(var(--dim))', marginBottom: 4 }}
            >
              {p.teamName ? (
                <span>{p.teamName}</span>
              ) : (
                <span style={{ color: 'rgb(var(--faint))' }}>未分队</span>
              )}{' '}
              · {posLabel}
            </div>

            {/* Player nickname */}
            <div
              className="font-display uppercase"
              style={{
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 0.92,
                color: 'rgb(var(--ink))',
                letterSpacing: '-0.01em',
              }}
            >
              {p.nickname}
            </div>

            {/* Recent form */}
            {p.recentForm.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <Kicker>近期战绩</Kicker>
                <FormDots form={p.recentForm} />
              </div>
            )}
          </div>

          {/* Win rate donut */}
          <WinDonut pct={s.winRate} size={104} />
        </div>
      </Panel>

      {/* 4 stat tiles */}
      <div className="grid gap-[10px] grid-cols-2 min-[560px]:grid-cols-4">
        <DTile
          label="场次"
          value={s.games}
          sub={`${s.wins} 胜 ${s.games - s.wins} 负`}
        />
        <DTile
          label="KDA"
          value={s.kda.toFixed(2)}
          sub={`${s.avgKills} / ${s.avgDeaths} / ${s.avgAssists}`}
        />
        <DTile
          label="场均输出"
          value={`${(s.avgDamage / 1000).toFixed(1)}K`}
          sub={`补刀 ${s.avgCs}`}
        />
        <DTile
          label="MVP"
          value={s.mvpCount}
          sub={`经济 ${(s.avgGold / 1000).toFixed(1)}K`}
        />
      </div>

      {/* Radar + ChampBars */}
      <div className="grid gap-[14px] grid-cols-1 min-[560px]:grid-cols-2">
        <Panel>
          <PanelHead title="RADAR · 能力雷达" />
          <div style={{ padding: 18, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 220 }}>
              <PlayerRadar axes={axes} size={220} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="CHAMP · 常用英雄" />
          <div style={{ padding: 18 }}>
            {p.commonChampions.length === 0 ? (
              <div className="font-mono text-[11px] text-nexus-faint text-center py-6">
                暂无英雄数据
              </div>
            ) : (
              <ChampBars
                champs={p.commonChampions.slice(0, 5).map((c) => ({
                  championName: c.championName ?? c.championId,
                  games: c.games,
                  winRate: c.winRate,
                  kda: c.kda.toFixed(2),
                }))}
              />
            )}
          </div>
        </Panel>
      </div>

      {/* Season trend (only shown when there are games) */}
      {p.games.length > 0 && (
        <Panel>
          <PanelHead
            title="TREND · 赛季趋势 · 胜负净值"
            actions={
              <span className="font-mono text-[10px] text-nexus-faint">
                {s.wins} 胜 {s.games - s.wins} 负
              </span>
            }
          />
          <div style={{ padding: 18 }}>
            {/* SeasonTrend expects earliest-first; API returns newest-first */}
            <SeasonTrend games={[...p.games].reverse()} w={900} h={84} />
          </div>
        </Panel>
      )}

      {/* Game log table */}
      <Panel>
        <PanelHead
          title="LOG · 对局记录"
          actions={
            <span className="font-mono text-[10px] text-nexus-faint">
              {p.games.length} 局
            </span>
          }
        />
        {p.games.length === 0 ? (
          <div className="font-mono text-[11px] text-nexus-faint text-center py-8">
            暂无对局记录
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  {['英雄', '对手', 'K/D/A', '补刀', '输出', '结果'].map((h, k) => (
                    <th
                      key={k}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'rgb(var(--faint))',
                        fontWeight: 600,
                        textAlign: k > 1 ? 'center' : 'left',
                        padding: '8px 14px',
                        borderBottom: '1px solid rgb(var(--line))',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.games.slice(0, 8).map((g) => (
                  <tr key={g.gameId}>
                    {/* Champion name + MVP star */}
                    <td
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: 'rgb(var(--ink))',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.championName ?? g.championId}
                      {g.isMvp && (
                        <span style={{ color: 'rgb(var(--gold))', marginLeft: 5 }}>★</span>
                      )}
                    </td>

                    {/* Opponent — links to match detail */}
                    <td
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        fontSize: 12,
                        color: 'rgb(var(--dim))',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Link
                        href={`/tournament/match/${g.matchId}`}
                        className="hover:text-nexus-accent transition-colors"
                      >
                        {g.opponent}
                      </Link>
                    </td>

                    {/* K/D/A */}
                    <td
                      className="font-mono tabular-nums"
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        textAlign: 'center',
                        fontSize: 12,
                        color: 'rgb(var(--ink))',
                      }}
                    >
                      {g.kills}/{g.deaths}/{g.assists}
                    </td>

                    {/* CS */}
                    <td
                      className="font-mono tabular-nums"
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        textAlign: 'center',
                        fontSize: 12,
                        color: 'rgb(var(--dim))',
                      }}
                    >
                      {g.cs}
                    </td>

                    {/* Damage */}
                    <td
                      className="font-mono tabular-nums"
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        textAlign: 'center',
                        fontSize: 12,
                        color: 'rgb(var(--dim))',
                      }}
                    >
                      {(g.damage / 1000).toFixed(1)}K
                    </td>

                    {/* Win / Loss result chip */}
                    <td
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid rgb(var(--line) / 0.4)',
                        textAlign: 'center',
                      }}
                    >
                      <Chip
                        variant={g.win ? 'good' : 'default'}
                        style={
                          g.win
                            ? undefined
                            : {
                                borderColor: 'rgb(var(--bad) / 0.5)',
                                color: 'rgb(var(--bad))',
                              }
                        }
                      >
                        {g.win ? '胜' : '负'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Empty / pre-tournament state ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '60px 0' }}>
      <Panel style={{ padding: '40px 48px', textAlign: 'center', maxWidth: 380 }}>
        <Kicker style={{ display: 'block', marginBottom: 12 }}>
          PLAYERS · 选手目录
        </Kicker>
        <div
          className="font-display uppercase"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'rgb(var(--ink))',
            marginBottom: 8,
          }}
        >
          暂无选手数据
        </div>
        <div className="font-mono text-[11px] text-nexus-faint">
          赛事开始报名后，选手将出现在此处。
        </div>
      </Panel>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

export function PlayersPage() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('kda');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  // Fetch leaderboard on mount and subscribe to SSE invalidations
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tournament/public/leaderboard');
      const body = (await res.json()) as { profiles?: PlayerProfile[] };
      const next = body.profiles ?? [];
      setProfiles(next);
      setSelectedId((cur) => {
        if (cur && next.some((p) => p.playerId === cur)) return cur;
        return pickDefault(next)?.playerId ?? null;
      });
    } catch {
      // Leave existing data in place on transient error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
  }, [fetchData]);

  // Compute filtered + sorted list
  const filteredList = useMemo(() => {
    let arr = profiles;

    if (posFilter !== 'ALL') {
      arr = arr.filter((p) => p.primaryPosition === posFilter);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (p) =>
          p.nickname.toLowerCase().includes(q) ||
          (p.teamName ?? '').toLowerCase().includes(q),
      );
    }

    return [...arr].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
  }, [profiles, posFilter, query, sortKey]);

  // Resolve selected profile (keep in sync with filtered list after filter changes)
  const selected = useMemo(() => {
    if (selectedId) {
      const found = profiles.find((p) => p.playerId === selectedId);
      if (found) return found;
    }
    return filteredList[0] ?? pickDefault(profiles) ?? null;
  }, [profiles, filteredList, selectedId]);

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: '60px 22px' }}>
        <div className="font-mono text-[12px] text-nexus-faint">加载中…</div>
      </div>
    );
  }

  // Pre-tournament / empty state
  if (profiles.length === 0) {
    return (
      <div style={{ padding: 22 }}>
        <EmptyState />
      </div>
    );
  }

  // Main two-column layout — collapses to a single stacked column < ~1180px.
  return (
    <div
      className="grid items-start gap-[18px] p-[22px] grid-cols-1 min-[1180px]:grid-cols-[380px_1fr]"
    >
      {/* LEFT — catalogue */}
      <Catalogue
        profiles={profiles}
        filteredList={filteredList}
        selectedId={selectedId}
        sortKey={sortKey}
        posFilter={posFilter}
        query={query}
        onSelect={setSelectedId}
        onSort={setSortKey}
        onPos={setPosFilter}
        onQuery={setQuery}
      />

      {/* RIGHT — observation file */}
      {selected ? (
        <ObservationFile profile={selected} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
