'use client';

import type { PlayerTournamentStats } from '@/lib/tournament/player-stats-service';
import { formatNumber, formatPercent, hueFromString, initials } from './shared';

function HeadlineStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-white/20 bg-white/10 px-3 py-2 backdrop-blur">
      <span className="block text-[11px] uppercase tracking-wide text-white/65">{label}</span>
      <strong className="mt-1 block text-2xl font-extrabold leading-none tabular-nums">{value}</strong>
      {hint ? <span className="mt-1 block text-[11px] text-white/70">{hint}</span> : null}
    </div>
  );
}

function RecentForm({ form }: { form: boolean[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-white/65">近期</span>
      {form.map((win, idx) => (
        <span
          key={idx}
          title={win ? '胜' : '负'}
          className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${
            win ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'
          }`}
        >
          {win ? '胜' : '负'}
        </span>
      ))}
    </div>
  );
}

export function PlayerHero({ stats }: { stats: PlayerTournamentStats }) {
  const { summary } = stats;
  const hue = hueFromString(stats.teamName ?? stats.nickname);
  const mvpRate = summary.games > 0 ? Math.round((summary.mvpCount / summary.games) * 1000) / 10 : 0;

  return (
    <section className="arena-panel arena-corner arena-scanline overflow-hidden text-white">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex min-w-0 gap-4">
          <div
            className="grid h-24 w-24 shrink-0 place-items-center rounded border border-cyan-200/35 text-3xl font-extrabold shadow-[0_0_34px_rgba(94,231,255,0.18)]"
            style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 65% 35%))` }}
          >
            {initials(stats.nickname)}
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              PLAYER PROFILE
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-extrabold leading-tight">{stats.nickname}</h1>
              {stats.roleTag ? (
                <span className="rounded border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-xs font-semibold text-amber-100 backdrop-blur">
                  {stats.roleTag}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-white/75">
              {stats.teamName ?? '未分队'} · {stats.primaryPosition ?? '位置未填'}
            </p>
            <p className="mt-1 text-xs text-white/55">
              扩展数据覆盖 {stats.extended.sourceGames}/{summary.games} 局
            </p>
            <div className="mt-4">
              <RecentForm form={stats.recentForm} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 self-center">
          <HeadlineStat label="胜率" value={formatPercent(summary.winRate)} hint={`${summary.wins}/${summary.games} 场`} />
          <HeadlineStat label="KDA" value={summary.kda.toString()} hint={`${summary.avgKills}/${summary.avgDeaths}/${summary.avgAssists}`} />
          <HeadlineStat
            label="MVP"
            value={`${summary.mvpCount} 次`}
            hint={summary.games > 0 ? `MVP率 ${mvpRate}%` : undefined}
          />
          <HeadlineStat
            label="参团率"
            value={formatPercent(stats.killParticipation)}
            hint={stats.killParticipation === null ? '数据不足' : '场均击杀参与'}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-cyan-200/10 border-t border-cyan-200/10 bg-black/15 text-center">
        <div className="py-3">
          <span className="block text-[11px] text-white/60">场次</span>
          <strong className="mt-1 block text-lg leading-none">{summary.games}</strong>
        </div>
        <div className="py-3">
          <span className="block text-[11px] text-white/60">场均伤害</span>
          <strong className="mt-1 block text-lg leading-none">{formatNumber(summary.avgDamage)}</strong>
        </div>
        <div className="py-3">
          <span className="block text-[11px] text-white/60">最长连胜</span>
          <strong className="mt-1 block text-lg leading-none">{stats.bestWinStreak} 连胜</strong>
        </div>
      </div>
    </section>
  );
}
