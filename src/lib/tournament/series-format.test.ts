import { describe, it, expect } from 'vitest';
import {
  winsNeeded,
  maxGames,
  computeSeriesScore,
  isSeriesComplete,
  seriesWinner,
} from './series-format';

describe('series-format', () => {
  it('winsNeeded: BO1=1, BO3=2, BO5=3', () => {
    expect(winsNeeded('BO1')).toBe(1);
    expect(winsNeeded('BO3')).toBe(2);
    expect(winsNeeded('BO5')).toBe(3);
  });

  it('maxGames: BO1=1, BO3=3, BO5=5', () => {
    expect(maxGames('BO1')).toBe(1);
    expect(maxGames('BO3')).toBe(3);
    expect(maxGames('BO5')).toBe(5);
  });

  it('computeSeriesScore counts wins by team', () => {
    const games = [
      { winnerTeamId: 'A' },
      { winnerTeamId: 'B' },
      { winnerTeamId: 'A' },
    ];
    expect(computeSeriesScore(games, 'A', 'B')).toEqual({ a: 2, b: 1 });
  });

  it('isSeriesComplete: true at threshold, false below', () => {
    expect(isSeriesComplete('BO3', { a: 2, b: 0 })).toBe(true);
    expect(isSeriesComplete('BO3', { a: 1, b: 1 })).toBe(false);
    expect(isSeriesComplete('BO5', { a: 3, b: 2 })).toBe(true);
  });

  it('seriesWinner returns null when incomplete, else winning teamId', () => {
    expect(seriesWinner('BO3', { a: 1, b: 0 }, 'A', 'B')).toBeNull();
    expect(seriesWinner('BO3', { a: 2, b: 0 }, 'A', 'B')).toBe('A');
    expect(seriesWinner('BO5', { a: 1, b: 3 }, 'A', 'B')).toBe('B');
  });
});
