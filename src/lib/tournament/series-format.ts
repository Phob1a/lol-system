import type { MatchFormat } from '@prisma/client';

export function winsNeeded(format: MatchFormat): number {
  return format === 'BO1' ? 1 : format === 'BO3' ? 2 : 3;
}

export function maxGames(format: MatchFormat): number {
  return format === 'BO1' ? 1 : format === 'BO3' ? 3 : 5;
}

export interface GameRow {
  winnerTeamId: string;
}

export function computeSeriesScore(
  games: GameRow[],
  teamAId: string,
  teamBId: string,
): { a: number; b: number } {
  let a = 0,
    b = 0;
  for (const g of games) {
    if (g.winnerTeamId === teamAId) a++;
    else if (g.winnerTeamId === teamBId) b++;
  }
  return { a, b };
}

export function isSeriesComplete(
  format: MatchFormat,
  score: { a: number; b: number },
): boolean {
  const need = winsNeeded(format);
  return score.a >= need || score.b >= need;
}

export function seriesWinner(
  format: MatchFormat,
  score: { a: number; b: number },
  teamAId: string,
  teamBId: string,
): string | null {
  const need = winsNeeded(format);
  if (score.a >= need) return teamAId;
  if (score.b >= need) return teamBId;
  return null;
}
