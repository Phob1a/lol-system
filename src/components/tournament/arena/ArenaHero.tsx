import Link from 'next/link';
import { ArrowRight, BarChart3, GitBranch, Trophy } from 'lucide-react';
import type { ArenaHeadline, ArenaStats } from '@/lib/tournament/arena-view-model';

type ArenaHeroProps = {
  headline: ArenaHeadline;
  stats: ArenaStats;
};

export function ArenaHero({ headline, stats }: ArenaHeroProps) {
  const cards = [
    {
      label: 'MATCH PROGRESS',
      value: `${stats.progressPercent}%`,
      detail: `${stats.completedMatches}/${stats.totalMatches} 已完成`,
      icon: Trophy,
    },
    {
      label: 'TEAMS ONLINE',
      value: String(stats.teamCount),
      detail: `${stats.groupCount} 个分组`,
      icon: BarChart3,
    },
    {
      label: 'BRACKET PATH',
      value: String(stats.bracketRoundCount),
      detail: '淘汰赛轮次',
      icon: GitBranch,
    },
  ];

  return (
    <section className="arena-panel arena-corner arena-scanline relative z-10 overflow-hidden p-5 md:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
            {headline.eyebrow}
          </p>
          <h2 className="mt-4 max-w-4xl text-4xl font-black leading-none text-white md:text-6xl">
            {headline.title}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            {headline.subtitle}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded border border-cyan-200/45 bg-cyan-200 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(94,231,255,0.35)]"
              href={headline.primaryCtaHref}
            >
              {headline.primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white"
              href={headline.secondaryCtaHref}
            >
              {headline.secondaryCtaLabel}
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.label} className="rounded border border-white/10 bg-slate-950/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {card.label}
                  </p>
                  <Icon className="h-4 w-4 text-amber-200" />
                </div>
                <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                <p className="mt-1 text-xs text-slate-400">{card.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
