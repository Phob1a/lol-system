'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { championIconUrl } from '@/lib/tournament/champions';
import { cn } from '@/lib/utils';
import type {
  DamageComposition,
  PlayerGameRow,
  PlayerRadarScores,
  PlayerTournamentStats as ServicePlayerTournamentStats,
  PlayerTrendPoint,
} from '@/lib/tournament/player-stats-service';

export type PlayerTournamentStats = ServicePlayerTournamentStats;
export type { PlayerGameRow };

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

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="mt-2 block text-xl font-semibold leading-none tabular-nums">{value}</span>
      {hint ? <span className="mt-2 block text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

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
      <span className="grid place-items-center rounded-md bg-slate-700 text-xs font-bold text-white" style={{ width: size, height: size }}>
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
      className="rounded-sm object-cover"
      onError={() => setErrored(true)}
    />
  );
}

function PlayerHeader({ stats }: { stats: PlayerTournamentStats }) {
  const { summary } = stats;
  return (
    <section className="overflow-hidden rounded-lg border bg-gradient-to-br from-slate-800 to-slate-600 text-white">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-white/30 bg-white/15 text-2xl font-extrabold">
            {initials(stats.nickname)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-extrabold leading-tight">{stats.nickname}</h1>
            <p className="mt-2 text-sm text-white/75">
              {stats.teamName ?? '未分队'} · {stats.primaryPosition ?? '位置未填'} · 扩展数据覆盖 {stats.extended.sourceGames}/{summary.games} 局
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">胜率 {summary.winRate}%</span>
              <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">KDA {summary.kda}</span>
              <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1">MVP {summary.mvpCount}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/25 bg-white/15 p-3">
            <span className="block text-xs text-white/70">场次</span>
            <strong className="mt-2 block text-2xl leading-none">{summary.games}</strong>
          </div>
          <div className="rounded-lg border border-white/25 bg-white/15 p-3">
            <span className="block text-xs text-white/70">胜场</span>
            <strong className="mt-2 block text-2xl leading-none">{summary.wins}</strong>
          </div>
          <div className="rounded-lg border border-white/25 bg-white/15 p-3">
            <span className="block text-xs text-white/70">场均伤害</span>
            <strong className="mt-2 block text-2xl leading-none">{formatNumber(summary.avgDamage)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function CoreStats({ stats }: { stats: PlayerTournamentStats }) {
  const s = stats.summary;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">稳定核心数据</h2>
        <span className="text-xs text-muted-foreground">排行榜口径</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="场均 K / D / A" value={`${s.avgKills} / ${s.avgDeaths} / ${s.avgAssists}`} hint={`KDA ${s.kda}`} />
        <StatCard label="场均伤害" value={formatNumber(s.avgDamage)} hint="对英雄伤害" />
        <StatCard label="场均金币" value={formatNumber(s.avgGold)} hint="经济效率" />
        <StatCard label="场均补刀" value={s.avgCs} hint="小兵 + 野怪" />
        <StatCard label="MVP" value={s.mvpCount} hint="本赛事" />
      </div>
    </section>
  );
}

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
  const points = values.map((value, idx) => {
    const angle = -Math.PI / 2 + idx * (Math.PI * 2 / 6);
    const radius = ((value ?? 0) / 100) * 104;
    return `${160 + Math.cos(angle) * radius},${160 + Math.sin(angle) * radius}`;
  }).join(' ');

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">六边形能力图</h2>
        <span className="text-xs text-muted-foreground">赛事内相对分</span>
      </div>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无扩展数据</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
          <svg viewBox="0 0 320 320" role="img" aria-label="六边形能力图" className="mx-auto w-full max-w-[280px]">
            <polygon points="160,56 250,108 250,212 160,264 70,212 70,108" fill="none" stroke="#d9e0ea" />
            <polygon points="160,91 220,126 220,194 160,229 100,194 100,126" fill="none" stroke="#e5e7eb" />
            <polygon points={points} fill="rgba(37,99,235,.2)" stroke="#2563eb" strokeWidth="3" />
            <text x="160" y="38" textAnchor="middle" className="fill-muted-foreground text-xs font-bold">输出</text>
            <text x="268" y="108" textAnchor="start" className="fill-muted-foreground text-xs font-bold">经济</text>
            <text x="268" y="218" textAnchor="start" className="fill-muted-foreground text-xs font-bold">视野</text>
            <text x="160" y="294" textAnchor="middle" className="fill-muted-foreground text-xs font-bold">生存</text>
            <text x="52" y="218" textAnchor="end" className="fill-muted-foreground text-xs font-bold">目标</text>
            <text x="52" y="108" textAnchor="end" className="fill-muted-foreground text-xs font-bold">团战</text>
          </svg>
          <div className="grid gap-2">
            {axes.map(([key, label]) => (
              <div key={key} className="grid grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-2 text-sm">
                <strong>{label}</strong>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-blue-600" style={{ width: `${radar[key] ?? 0}%` }} />
                </div>
                <span className="text-right tabular-nums">{radar[key] ?? '—'}</span>
              </div>
            ))}
            {radar.sampleSizeWarning ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                小样本，仅供参考：扩展数据 {radar.sourceGames} 局，对比选手 {radar.comparisonPlayers} 人。
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function NormalizedTrendChart({ trends }: { trends: PlayerTrendPoint[] }) {
  const points = trends.filter((trend) => trend.damagePercentile !== null || trend.visionPercentile !== null).slice(0, 8).reverse();
  const canDrawLine = points.length >= 3;
  const x = (idx: number) => 52 + idx * (396 / Math.max(1, points.length - 1));
  const y = (value: number | null) => 156 - ((value ?? 0) / 100) * 120;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">输出 / 视野趋势</h2>
        <span className="text-xs text-muted-foreground">归一化到 0-100</span>
      </div>
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无趋势数据</p>
      ) : canDrawLine ? (
        <>
          <svg viewBox="0 0 500 180" role="img" aria-label="归一化输出和视野趋势" className="h-52 w-full">
            {[36, 96, 156].map((yy) => <line key={yy} x1="44" x2="460" y1={yy} y2={yy} stroke="#e5e7eb" />)}
            <polyline
              points={points.map((point, idx) => `${x(idx)},${y(point.damagePercentile)}`).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={points.map((point, idx) => `${x(idx)},${y(point.visionPercentile)}`).join(' ')}
              fill="none"
              stroke="#0f766e"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((point, idx) => (
              <text key={point.gameId} x={x(idx)} y="174" textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
                {point.matchLabel}
              </text>
            ))}
            <text x="20" y="40" textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">100</text>
            <text x="20" y="100" textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">50</text>
            <text x="20" y="160" textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">0</text>
          </svg>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />对英雄伤害分位</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-700" />视野分分位</span>
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">少于 3 场，不画趋势线。</p>
          {points.map((point) => (
            <div key={point.gameId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 rounded-md border bg-muted/20 p-2 text-sm">
              <span>{point.matchLabel}</span>
              <span>伤害 {point.damagePercentile ?? '—'}</span>
              <span>视野 {point.visionPercentile ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DamageCompositionChart({ games }: { games: PlayerGameRow[] }) {
  const rows = games
    .map((game) => ({ game, composition: game.extended?.damageComposition ?? null }))
    .filter((row): row is { game: PlayerGameRow; composition: DamageComposition } => row.composition !== null)
    .slice(0, 5);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">伤害构成</h2>
        <span className="text-xs text-muted-foreground">物理 / 魔法 / 真实</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无伤害构成数据</p>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ game, composition }) => (
            <div key={game.gameId} className="grid grid-cols-[90px_minmax(0,1fr)_60px] items-center gap-3 text-sm">
              <span className="truncate font-medium">{game.matchLabel}</span>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <span className="bg-blue-600" style={{ width: `${composition.physicalPct}%` }} />
                <span className="bg-violet-600" style={{ width: `${composition.magicPct}%` }} />
                <span className="bg-amber-600" style={{ width: `${composition.truePct}%` }} />
              </div>
              <span className="text-right tabular-nums">{formatNumber(composition.total)}</span>
            </div>
          ))}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />物理</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-600" />魔法</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-600" />真实</span>
          </div>
        </div>
      )}
    </section>
  );
}

function ExtendedOverview({ stats }: { stats: PlayerTournamentStats }) {
  const a = stats.extended.averages;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">扩展概览</h2>
        <span className="text-xs text-muted-foreground">覆盖 {stats.extended.sourceGames}/{stats.extended.totalGames} 局</span>
      </div>
      {stats.extended.sourceGames === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无扩展数据</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="视野" value={formatRawNumber(a.avgVisionScore)} hint={`插眼 ${formatRawNumber(a.avgWardsPlaced)} · 排眼 ${formatRawNumber(a.avgWardsKilled)}`} />
          <StatCard label="承伤 / 减免" value={formatNumber(a.avgDamageTaken)} hint={`减免 ${formatNumber(a.avgDamageMitigated)}`} />
          <StatCard label="目标伤害" value={formatNumber(a.avgObjectiveDamage)} hint={`防御塔 ${formatNumber(a.avgTurretDamage)}`} />
          <StatCard label="治疗 / 控制" value={formatNumber(a.avgHealing)} hint={`控制 ${formatRawNumber(a.avgCcTime)} 秒`} />
        </div>
      )}
    </section>
  );
}

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
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">高光徽标</h2>
        <span className="text-xs text-muted-foreground">只显示次数，不显示事件时间</span>
      </div>
      {stats.extended.sourceGames === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无高光事件数据</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <div key={event.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border bg-muted/20 p-3">
              <span className="min-w-0">
                <strong className="block truncate text-sm">{event.label}</strong>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{event.hint}</span>
              </span>
              <span className="text-2xl font-extrabold tabular-nums">{event.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RawStatsBlock({ rawStats }: { rawStats: Record<string, unknown> | null | undefined }) {
  if (!rawStats) return null;
  const sorted = Object.fromEntries(Object.entries(rawStats).sort(([a], [b]) => a.localeCompare(b)));
  return (
    <details className="rounded-md border bg-background">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">原始 extStats 字段</summary>
      <pre className="max-h-72 overflow-auto border-t bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
        {JSON.stringify(sorted, null, 2)}
      </pre>
    </details>
  );
}

function GamesTable({ games }: { games: PlayerGameRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(games[0]?.gameId ?? null);
  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground">暂无对局记录</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {games.map((row) => {
        const open = expanded === row.gameId;
        const ext = row.extended;
        return (
          <article key={row.gameId} className="overflow-hidden rounded-lg border bg-card">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : row.gameId)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left transition hover:bg-muted/40"
              aria-expanded={open}
            >
              <Badge variant={row.win ? 'default' : 'secondary'} className={cn(row.win ? 'bg-emerald-600' : 'bg-rose-500 text-white')}>
                {row.win ? '胜' : '负'}
              </Badge>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{row.matchLabel} · {row.opponent}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <ChampionIcon championId={row.championId} championName={row.championName} size={18} />
                  {row.championName ?? row.championId} · {row.kills}/{row.deaths}/{row.assists} · 伤害 {row.damage.toLocaleString()}
                </span>
              </span>
              <span className="text-sm font-medium text-primary">{open ? '收起' : '展开'}</span>
            </button>
            {open ? (
              <div className="grid gap-3 border-t bg-muted/10 p-3">
                {!ext ? (
                  <p className="text-sm text-muted-foreground">无扩展数据</p>
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
                        <p className="mb-2 text-xs text-muted-foreground">装备 item0-item6</p>
                        <div className="flex flex-wrap gap-2">
                          {ext.items.map((item, index) => (
                            <span key={`${item}-${index}`} className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-800">
                              {item}
                            </span>
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

export function PlayerStatsView({ stats }: { stats: PlayerTournamentStats }) {
  return (
    <div className="space-y-4">
      <PlayerHeader stats={stats} />
      <CoreStats stats={stats} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <RadarHexagon radar={stats.extended.radar} />
        <NormalizedTrendChart trends={stats.extended.trends} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DamageCompositionChart games={stats.games} />
        <HighlightEvents stats={stats} />
      </div>
      <ExtendedOverview stats={stats} />
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">逐场扩展与原始字段</h2>
          <span className="text-xs text-muted-foreground">默认展开最近一局</span>
        </div>
        <GamesTable games={stats.games} />
      </section>
    </div>
  );
}
