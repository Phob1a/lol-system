import { GitCommitHorizontal } from 'lucide-react';
import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type BracketPathPreviewProps = {
  bracket: PublicTournamentState['bracket'];
};

export function BracketPathPreview({ bracket }: BracketPathPreviewProps) {
  const rounds = bracket.length > 0 ? bracket : [{ roundKey: 'WAITING', matches: [] }];

  return (
    <section className="arena-panel arena-corner p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            BRACKET PATH
          </p>
          <h3 className="mt-2 text-xl font-bold text-white">淘汰路径</h3>
        </div>
        <GitCommitHorizontal className="h-5 w-5 text-amber-200" />
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden">
        {rounds.map((round, index) => (
          <a
            key={round.roundKey}
            href="#bracket"
            className="min-w-0 flex-1 rounded border border-cyan-200/15 bg-slate-950/30 p-3"
          >
            <p className="truncate text-xs font-semibold text-cyan-100">{round.roundKey}</p>
            <p className="mt-3 text-2xl font-black text-white">{round.matches.length}</p>
            <p className="text-xs text-slate-400">ROUND {index + 1}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
