import Link from 'next/link';
import { CalendarClock, Swords } from 'lucide-react';
import type { ArenaMatch } from '@/lib/tournament/arena-view-model';
import { formatArenaDateTime } from '@/lib/tournament/arena-view-model';

type NextMatchPanelProps = {
  match: ArenaMatch | null;
};

export function NextMatchPanel({ match }: NextMatchPanelProps) {
  if (!match) {
    return (
      <section className="arena-panel arena-corner p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
          NEXT MATCH
        </p>
        <h3 className="mt-3 text-2xl font-bold text-white">等待下一场同步</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          当前没有可公开的已排期比赛，赛程生成后这里会出现观赛入口。
        </p>
        <a
          href="#schedule"
          className="mt-5 inline-flex rounded border border-cyan-200/30 px-4 py-2 text-sm font-semibold text-cyan-100"
        >
          查看赛程
        </a>
      </section>
    );
  }

  return (
    <section className="arena-panel arena-corner p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
          NEXT MATCH
        </p>
        <span className="inline-flex items-center gap-1 text-xs text-amber-100">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatArenaDateTime(match.scheduledAt)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <p className="min-w-0 truncate text-lg font-bold text-white">{match.teamA?.name ?? '待定席位'}</p>
        <Swords className="h-5 w-5 text-cyan-200" />
        <p className="min-w-0 truncate text-right text-lg font-bold text-white">
          {match.teamB?.name ?? '待定席位'}
        </p>
      </div>
      <p className="mt-3 text-sm text-slate-400">{match.label ?? match.roundKey ?? '赛事对局'} · BO{match.bestOf}</p>
      <Link
        href={`/tournament/match/${match.id}`}
        className="mt-5 inline-flex w-full items-center justify-center rounded border border-cyan-200/45 bg-cyan-200/15 px-4 py-3 text-sm font-semibold text-cyan-50"
      >
        进入比赛详情
      </Link>
    </section>
  );
}
