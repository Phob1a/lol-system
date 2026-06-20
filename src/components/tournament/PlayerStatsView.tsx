'use client';

import { useState } from 'react';
import { championIconUrl } from '@/lib/tournament/champions';

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import Chip from '@/components/nexus/Chip';

import WinDonut from '@/components/nexus/charts/WinDonut';
import PlayerRadar from '@/components/nexus/charts/PlayerRadar';
import { ChampBars } from '@/components/nexus/charts/ChampBars';
import { FormDots } from '@/components/nexus/charts/FormDots';

import type {
  DamageComposition,
  PlayerGameRow,
  PlayerRadarScores,
  PlayerTournamentStats as ServicePlayerTournamentStats,
  PlayerTrendPoint,
} from '@/lib/tournament/player-stats-service';

export type PlayerTournamentStats = ServicePlayerTournamentStats;
export type { PlayerGameRow };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 0)}K`;
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatRawNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : Math.round(value).toLocaleString();
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-4 py-3">
      <Kicker as="span" style={{ display: 'block' }}>{label}</Kicker>
      <Readout className="mt-2 block text-xl font-semibold leading-none text-nexus-ink">
        {value}
      </Readout>
      {hint ? (
        <span className="mt-2 block font-mono text-[10px] text-nexus-faint">{hint}</span>
      ) : null}
    </div>
  );
}

// ── ChampionIcon ──────────────────────────────────────────────────────────────

function ChampionIcon({
  championId,
  championName,
  size = 24,
}: {
  championId: string;
  championName: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  if (!championId || errored) {
    return (
      <span
        className="grid place-items-center rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 font-mono text-xs font-bold text-nexus-ink"
        style={{ width: size, height: size }}
      >
        {(championName ?? championId).slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(championId)}
      alt={championName ?? championId}
      width={size}
      height={size}
      className="rounded-[var(--radius-nexus)] object-cover"
      onError={() => setErrored(true)}
    />
  );
}

// ── PlayerHeader ──────────────────────────────────────────────────────────────

function PlayerHeader({ stats }: { stats: PlayerTournamentStats }) {
  const { summary } = stats;
  return (
    <Panel glow as="section" style={{ overflow: 'hidden' }}>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-nexus)] border border-nexus-accent/40 bg-nexus-panel-2 font-display text-2xl font-extrabold text-nexus-ink">
            {initials(stats.nickname)}
          </div>
          <div className="min-w-0">
            <Kicker style={{ display: 'block', marginBottom: 6 }}>
              PLAYER PROFILE · {stats.playerId.toUpperCase().slice(0, 16)}
            </Kicker>
            <h1 className="truncate font-display uppercase text-3xl font-extrabold leading-tight text-nexus-ink">
              {stats.nickname}
            </h1>
            <p className="mt-1 font-mono text-[12px] text-nexus-dim">
              {stats.teamName ?? '未分队'} · {stats.primaryPosition ?? '位置未填'} · 扩展数据覆盖{' '}
              {stats.extended.sourceGames}/{summary.games} 局
            </p>
            {stats.recentForm.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <Kicker>近期战绩</Kicker>
                <FormDots form={stats.recentForm} />
              </div>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '场次', val: String(summary.games) },
            { label: '胜场', val: String(summary.wins) },
            { label: '场均伤害', val: formatNumber(summary.avgDamage) },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="rounded-[var(--radius-nexus)] border border-nexus-line/60 bg-nexus-panel-2/60 p-3"
            >
              <Kicker style={{ display: 'block' }}>{label}</Kicker>
              <strong className="mt-2 block font-display text-2xl leading-none text-nexus-ink tabular-nums">
                {val}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ── HeroOverview (WinDonut + 4 DTiles) ────────────────────────────────────────

function HeroOverview({ stats }: { stats: PlayerTournamentStats }) {
  const s = stats.summary;
  const posLabel = stats.primaryPosition ?? '位置未填';
  return (
    <Panel glow as="section" style={{ padding: 22 }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Kicker style={{ display: 'block', marginBottom: 6 }}>
            OBSERVATION FILE · {stats.teamName ?? '未分队'}
          </Kicker>
          <div className="font-serif italic text-nexus-dim" style={{ fontSize: 15, marginBottom: 4 }}>
            {posLabel}
          </div>
          <div
            className="font-display uppercase text-nexus-ink"
            style={{ fontSize: 36, fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.01em' }}
          >
            {stats.nickname}
          </div>
        </div>
        <WinDonut pct={s.winRate} size={104} />
      </div>
      <div className="mt-5 grid gap-[10px] grid-cols-2 min-[560px]:grid-cols-4">
        <DTile label="场次" value={s.games} sub={`${s.wins} 胜 ${s.games - s.wins} 负`} />
        <DTile label="KDA" value={s.kda.toFixed(2)} sub={`${s.avgKills} / ${s.avgDeaths} / ${s.avgAssists}`} />
        <DTile label="场均输出" value={`${(s.avgDamage / 1000).toFixed(1)}K`} sub={`补刀 ${s.avgCs}`} />
        <DTile label="MVP" value={s.mvpCount} sub={`经济 ${(s.avgGold / 1000).toFixed(1)}K`} />
      </div>
    </Panel>
  );
}

// ── CoreStats ─────────────────────────────────────────────────────────────────

function CoreStats({ stats }: { stats: PlayerTournamentStats }) {
  const s = stats.summary;
  return (
    <Panel as="section">
      <PanelHead
        title="CORE STATS · 稳定核心数据"
        actions={<Kicker>排行榜口径</Kicker>}
      />
      <div className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="场均 K / D / A" value={`${s.avgKills} / ${s.avgDeaths} / ${s.avgAssists}`} hint={`KDA ${s.kda}`} />
        <StatCard label="场均伤害" value={formatNumber(s.avgDamage)} hint="对英雄伤害" />
        <StatCard label="场均金币" value={formatNumber(s.avgGold)} hint="经济效率" />
        <StatCard label="场均补刀" value={s.avgCs} hint="小兵 + 野怪" />
        <StatCard label="MVP" value={s.mvpCount} hint="本赛事" />
      </div>
    </Panel>
  );
}

// ── RadarHexagon ──────────────────────────────────────────────────────────────

function RadarHexagon({ radar }: { radar: PlayerRadarScores }) {
  const axes: Array<[keyof Pick<PlayerRadarScores, 'output' | 'economy' | 'vision' | 'survival' | 'objective' | 'teamfight'>, string]> = [
    ['output', '输出'],
    ['economy', '经济'],
    ['vision', '视野'],
    ['survival', '生存'],
    ['objective', '目标'],
    ['teamfight', '团战'],
  ];
  const values = axes.map(([key]) => radar[key]);
  const hasData = values.some((value) => value !== null);

  // Build normalised axes (0..1) for the nexus PlayerRadar chart
  const radarAxes = axes.map(([key, label]) => ({
    label,
    v: (radar[key] ?? 0) / 100,
  }));

  return (
    <Panel as="section">
      <PanelHead
        title={<h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">六边形能力图</h2>}
        actions={<Kicker>赛事内相对分</Kicker>}
      />
      <div className="p-4">
        {!hasData ? (
          <p className="py-8 text-center font-mono text-[11px] text-nexus-faint">暂无扩展数据</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
            {/* Nexus PlayerRadar */}
            <div className="mx-auto" style={{ width: 220 }}>
              <PlayerRadar axes={radarAxes} size={220} />
            </div>
            {/* Bar list */}
            <div className="grid gap-2">
              {axes.map(([key, label]) => (
                <div key={key} className="grid grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-2 text-sm">
                  <strong className="font-mono text-[11px] text-nexus-dim">{label}</strong>
                  <div
                    className="h-[5px] overflow-hidden rounded-full"
                    style={{ background: 'rgb(var(--line))' }}
                  >
                    <span
                      className="block h-full rounded-full motion-safe:transition-all motion-safe:duration-500"
                      style={{ width: `${radar[key] ?? 0}%`, background: 'rgb(var(--accent-n))' }}
                    />
                  </div>
                  <Readout className="text-right text-[12px] text-nexus-ink">{radar[key] ?? '—'}</Readout>
                </div>
              ))}
              {radar.sampleSizeWarning ? (
                <p className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-2 font-mono text-[10px] text-nexus-dim">
                  小样本，仅供参考：扩展数据 {radar.sourceGames} 局，对比选手 {radar.comparisonPlayers} 人。
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── NormalizedTrendChart ──────────────────────────────────────────────────────

function NormalizedTrendChart({ trends }: { trends: PlayerTrendPoint[] }) {
  const points = trends
    .filter((trend) => trend.damagePercentile !== null || trend.visionPercentile !== null)
    .slice(0, 8)
    .reverse();
  const canDrawLine = points.length >= 3;
  const x = (idx: number) => 52 + idx * (396 / Math.max(1, points.length - 1));
  const y = (value: number | null) => 156 - ((value ?? 0) / 100) * 120;

  return (
    <Panel as="section">
      <PanelHead
        title={<h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">输出 / 视野趋势</h2>}
        actions={<Kicker>归一化到 0-100</Kicker>}
      />
      <div className="p-4">
        {points.length === 0 ? (
          <p className="py-8 text-center font-mono text-[11px] text-nexus-faint">暂无趋势数据</p>
        ) : canDrawLine ? (
          <>
            <svg viewBox="0 0 500 180" role="img" aria-label="归一化输出和视野趋势" className="h-52 w-full">
              {[36, 96, 156].map((yy) => (
                <line key={yy} x1="44" x2="460" y1={yy} y2={yy} stroke="rgb(var(--line))" />
              ))}
              <polyline
                points={points.map((point, idx) => `${x(idx)},${y(point.damagePercentile)}`).join(' ')}
                fill="none"
                stroke="rgb(var(--accent-n))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={points.map((point, idx) => `${x(idx)},${y(point.visionPercentile)}`).join(' ')}
                fill="none"
                stroke="rgb(var(--accent-n2))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((point, idx) => (
                <text
                  key={point.gameId}
                  x={x(idx)}
                  y="174"
                  textAnchor="middle"
                  fill="rgb(var(--faint))"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                  fontWeight="600"
                >
                  {point.matchLabel}
                </text>
              ))}
              <text x="20" y="40" textAnchor="middle" fill="rgb(var(--faint))" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600">100</text>
              <text x="20" y="100" textAnchor="middle" fill="rgb(var(--faint))" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600">50</text>
              <text x="20" y="160" textAnchor="middle" fill="rgb(var(--faint))" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600">0</text>
            </svg>
            <div className="flex gap-4 font-mono text-[10px] text-nexus-faint">
              <span>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ background: 'rgb(var(--accent-n))' }}
                />
                对英雄伤害分位
              </span>
              <span>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ background: 'rgb(var(--accent-n2))' }}
                />
                视野分分位
              </span>
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <p className="font-mono text-[11px] text-nexus-dim">少于 3 场，不画趋势线。</p>
            {points.map((point) => (
              <div
                key={point.gameId}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-2 font-mono text-[12px] text-nexus-dim"
              >
                <span>{point.matchLabel}</span>
                <span className="tabular-nums">伤害 {point.damagePercentile ?? '—'}</span>
                <span className="tabular-nums">视野 {point.visionPercentile ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── DamageCompositionChart ────────────────────────────────────────────────────

function DamageCompositionChart({ games }: { games: PlayerGameRow[] }) {
  const rows = games
    .map((game) => ({ game, composition: game.extended?.damageComposition ?? null }))
    .filter((row): row is { game: PlayerGameRow; composition: DamageComposition } => row.composition !== null)
    .slice(0, 5);

  return (
    <Panel as="section">
      <PanelHead
        title={<h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">伤害构成</h2>}
        actions={<Kicker>物理 / 魔法 / 真实</Kicker>}
      />
      <div className="p-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center font-mono text-[11px] text-nexus-faint">暂无伤害构成数据</p>
        ) : (
          <div className="grid gap-3">
            {rows.map(({ game, composition }) => (
              <div key={game.gameId} className="grid grid-cols-[90px_minmax(0,1fr)_60px] items-center gap-3">
                <span className="truncate font-mono text-[11px] text-nexus-dim">{game.matchLabel}</span>
                <div
                  className="flex h-[5px] overflow-hidden rounded-full"
                  style={{ background: 'rgb(var(--line))' }}
                >
                  <span style={{ background: 'rgb(var(--accent-n))', width: `${composition.physicalPct}%` }} />
                  <span style={{ background: 'rgb(var(--accent-n2))', width: `${composition.magicPct}%` }} />
                  <span style={{ background: 'rgb(var(--gold))', width: `${composition.truePct}%` }} />
                </div>
                <Readout className="text-right text-[12px] text-nexus-dim tabular-nums">
                  {formatNumber(composition.total)}
                </Readout>
              </div>
            ))}
            <div className="flex gap-4 font-mono text-[10px] text-nexus-faint">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'rgb(var(--accent-n))' }} />
                物理
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'rgb(var(--accent-n2))' }} />
                魔法
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'rgb(var(--gold))' }} />
                真实
              </span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── ExtendedOverview ──────────────────────────────────────────────────────────

function ExtendedOverview({ stats }: { stats: PlayerTournamentStats }) {
  const a = stats.extended.averages;
  return (
    <Panel as="section">
      <PanelHead
        title="EXTENDED · 扩展概览"
        actions={
          <Kicker>
            覆盖 {stats.extended.sourceGames}/{stats.extended.totalGames} 局
          </Kicker>
        }
      />
      <div className="p-4">
        {stats.extended.sourceGames === 0 ? (
          <p className="py-8 text-center font-mono text-[11px] text-nexus-faint">暂无扩展数据</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="视野" value={formatRawNumber(a.avgVisionScore)} hint={`插眼 ${formatRawNumber(a.avgWardsPlaced)} · 排眼 ${formatRawNumber(a.avgWardsKilled)}`} />
            <StatCard label="承伤 / 减免" value={formatNumber(a.avgDamageTaken)} hint={`减免 ${formatNumber(a.avgDamageMitigated)}`} />
            <StatCard label="目标伤害" value={formatNumber(a.avgObjectiveDamage)} hint={`防御塔 ${formatNumber(a.avgTurretDamage)}`} />
            <StatCard label="治疗 / 控制" value={formatNumber(a.avgHealing)} hint={`控制 ${formatRawNumber(a.avgCcTime)} 秒`} />
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── HighlightEvents ───────────────────────────────────────────────────────────

function HighlightEvents({ stats }: { stats: PlayerTournamentStats }) {
  const t = stats.extended.totals;
  const events = [
    { label: '首杀参与', hint: 'firstBloodKill / Assist', value: t.firstBloodKills + t.firstBloodAssists },
    { label: '首塔参与', hint: 'firstTowerKill / Assist', value: t.firstTowerKills + t.firstTowerAssists },
    { label: '推塔', hint: 'turretKills', value: t.turretKills },
    { label: '最高多杀', hint: 'largestMultiKill', value: t.largestMultiKill ?? 0 },
    { label: '三杀+', hint: 'triple/quadra/penta', value: t.tripleKills + t.quadraKills + t.pentaKills },
    { label: '最大连杀', hint: 'largestKillingSpree', value: t.largestKillingSpree ?? 0 },
  ];
  return (
    <Panel as="section">
      <PanelHead
        title={<h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-nexus-faint whitespace-nowrap">高光徽标</h2>}
        actions={<Kicker>只显示次数，不显示事件时间</Kicker>}
      />
      <div className="p-4">
        {stats.extended.sourceGames === 0 ? (
          <p className="py-8 text-center font-mono text-[11px] text-nexus-faint">暂无高光事件数据</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <div
                key={event.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-3"
              >
                <span className="min-w-0">
                  <strong className="block truncate font-body text-[13px] text-nexus-ink">{event.label}</strong>
                  <span className="mt-1 block truncate font-mono text-[10px] text-nexus-faint">{event.hint}</span>
                </span>
                <Readout className="text-2xl font-extrabold text-nexus-accent tabular-nums">{event.value}</Readout>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── RawStatsBlock ─────────────────────────────────────────────────────────────

function RawStatsBlock({ rawStats }: { rawStats: Record<string, unknown> | null | undefined }) {
  if (!rawStats) return null;
  const sorted = Object.fromEntries(Object.entries(rawStats).sort(([a], [b]) => a.localeCompare(b)));
  return (
    <details className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel">
      <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] font-semibold text-nexus-dim">
        原始 extStats 字段
      </summary>
      <pre
        className="max-h-72 overflow-auto border-t border-nexus-line p-3 font-mono text-xs leading-relaxed text-nexus-dim"
        style={{ background: 'rgb(var(--panel-2))' }}
      >
        {JSON.stringify(sorted, null, 2)}
      </pre>
    </details>
  );
}

// ── GamesTable ────────────────────────────────────────────────────────────────

function GamesTable({ games }: { games: PlayerGameRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(games[0]?.gameId ?? null);
  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="font-mono text-[11px] text-nexus-faint">暂无对局记录</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {games.map((row) => {
        const open = expanded === row.gameId;
        const ext = row.extended;
        return (
          <article
            key={row.gameId}
            className="overflow-hidden rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2"
          >
            <button
              type="button"
              onClick={() => setExpanded(open ? null : row.gameId)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-nexus-surface"
              aria-expanded={open}
            >
              <Chip
                variant={row.win ? 'good' : 'default'}
                style={
                  row.win
                    ? undefined
                    : { borderColor: 'rgb(var(--bad) / 0.5)', color: 'rgb(var(--bad))' }
                }
              >
                {row.win ? '胜' : '负'}
              </Chip>
              <span className="min-w-0">
                <span className="block truncate font-body text-[13px] font-semibold text-nexus-ink">
                  {row.matchLabel} · {row.opponent}
                </span>
                <span className="mt-1 flex items-center gap-2 font-mono text-[10px] text-nexus-dim">
                  <ChampionIcon championId={row.championId} championName={row.championName} size={18} />
                  {row.championName ?? row.championId} · {row.kills}/{row.deaths}/{row.assists} · 伤害{' '}
                  <span className="tabular-nums">{row.damage.toLocaleString()}</span>
                </span>
              </span>
              <span className="font-mono text-[11px] text-nexus-accent">{open ? '收起' : '展开'}</span>
            </button>
            {open ? (
              <div className="grid gap-3 border-t border-nexus-line bg-nexus-panel p-3">
                {!ext ? (
                  <p className="font-mono text-[11px] text-nexus-faint">无扩展数据</p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <StatCard label="召唤师技能" value={`${ext.spell1Id ?? '—'} / ${ext.spell2Id ?? '—'}`} />
                      <StatCard label="英雄等级" value={ext.championLevel ?? '—'} />
                      <StatCard label="目标伤害" value={formatNumber(ext.objectiveDamage)} />
                      <StatCard label="视野分" value={formatRawNumber(ext.visionScore)} />
                      <StatCard label="承伤" value={formatNumber(ext.damageTaken)} />
                      <StatCard label="减免" value={formatNumber(ext.damageMitigated)} />
                      <StatCard label="插眼 / 排眼" value={`${formatRawNumber(ext.wardsPlaced)} / ${formatRawNumber(ext.wardsKilled)}`} />
                      <StatCard label="真眼" value={formatRawNumber(ext.controlWardsBought)} />
                    </div>
                    {ext.items.length > 0 ? (
                      <div>
                        <Kicker as="p" style={{ marginBottom: 8 }}>装备 item0-item6</Kicker>
                        <div className="flex flex-wrap gap-2">
                          {ext.items.map((item, index) => (
                            <Chip key={`${item}-${index}`}>{item}</Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <RawStatsBlock rawStats={ext.rawStats} />
                  </>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// ── CommonChampions sidebar (ChampBars) ───────────────────────────────────────

function CommonChampions({ stats }: { stats: PlayerTournamentStats }) {
  if (stats.commonChampions.length === 0) return null;
  return (
    <Panel as="section">
      <PanelHead title="CHAMP · 常用英雄" />
      <div className="p-4">
        <ChampBars
          champs={stats.commonChampions.slice(0, 5).map((c) => ({
            championName: c.championName ?? c.championId,
            games: c.games,
            winRate: c.winRate,
            kda: c.kda.toFixed(2),
          }))}
        />
      </div>
    </Panel>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PlayerStatsView({ stats }: { stats: PlayerTournamentStats }) {
  return (
    <div className="space-y-4">
      <PlayerHeader stats={stats} />
      <HeroOverview stats={stats} />
      <CoreStats stats={stats} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <RadarHexagon radar={stats.extended.radar} />
        <NormalizedTrendChart trends={stats.extended.trends} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DamageCompositionChart games={stats.games} />
        <HighlightEvents stats={stats} />
      </div>
      {stats.commonChampions.length > 0 && <CommonChampions stats={stats} />}
      <ExtendedOverview stats={stats} />
      <Panel as="section">
        <PanelHead
          title="LOG · 逐场扩展与原始字段"
          actions={<Kicker>默认展开最近一局</Kicker>}
        />
        <div className="p-4">
          <GamesTable games={stats.games} />
        </div>
      </Panel>
    </div>
  );
}
