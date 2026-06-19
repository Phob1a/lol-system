'use client';

import type { PlayerGameRow, PlayerTournamentStats } from '@/lib/tournament/player-stats-service';
import { ChampionIcon, formatNumber, formatPercent, Section } from './shared';

function kdaOf(row: PlayerGameRow): number {
  return Math.round(((row.kills + row.assists) / Math.max(1, row.deaths)) * 100) / 100;
}

/** 代表作：优先 MVP 局，否则最高 KDA 局。 */
function pickSignatureGame(games: PlayerGameRow[]): PlayerGameRow | null {
  if (games.length === 0) return null;
  const mvp = games.find((g) => g.isMvp);
  if (mvp) return mvp;
  return games.reduce((best, g) => (kdaOf(g) > kdaOf(best) ? g : best));
}

function SignatureCard({ game }: { game: PlayerGameRow }) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-amber-50 to-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">代表作</span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700">
          {game.isMvp ? 'MVP 之战' : '高光一局'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <ChampionIcon championId={game.championId} championName={game.championName} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{game.championName ?? game.championId}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {game.matchLabel} · vs {game.opponent}
          </p>
        </div>
        <span
          className={`ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-bold text-white ${
            game.win ? 'bg-emerald-600' : 'bg-rose-500'
          }`}
        >
          {game.win ? '胜' : '负'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/40 py-2">
          <span className="block text-[11px] text-muted-foreground">KDA</span>
          <strong className="text-sm tabular-nums">
            {game.kills}/{game.deaths}/{game.assists}
          </strong>
        </div>
        <div className="rounded-md bg-muted/40 py-2">
          <span className="block text-[11px] text-muted-foreground">伤害</span>
          <strong className="text-sm tabular-nums">{formatNumber(game.damage)}</strong>
        </div>
        <div className="rounded-md bg-muted/40 py-2">
          <span className="block text-[11px] text-muted-foreground">补刀</span>
          <strong className="text-sm tabular-nums">{game.cs}</strong>
        </div>
      </div>
    </div>
  );
}

export function PlayerChampionPool({ stats }: { stats: PlayerTournamentStats }) {
  const champions = stats.commonChampions.slice(0, 6);
  const signature = pickSignatureGame(stats.games);

  return (
    <Section title="招牌英雄池" subtitle="按场次排序">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {champions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无英雄数据</p>
        ) : (
          <div className="grid gap-2">
            {champions.map((champ) => (
              <div
                key={champ.championId}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-2.5"
              >
                <ChampionIcon championId={champ.championId} championName={champ.championName} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{champ.championName ?? champ.championId}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {champ.games} 场 · KDA {champ.kda} · 均伤 {formatNumber(champ.avgDamage)}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      champ.winRate >= 50 ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  >
                    {formatPercent(champ.winRate)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{champ.wins}胜</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {signature ? <SignatureCard game={signature} /> : null}
      </div>
    </Section>
  );
}
