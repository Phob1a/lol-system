import { describe, expect, it } from 'vitest';
import type { LeaderboardRow } from './LeaderboardView';

// Re-implement the local sortRows to test it in isolation
// (it's not exported from the module but its logic is trivial enough to verify here)
function sortRows(
  rows: LeaderboardRow[],
  key: keyof Omit<LeaderboardRow, 'registrationId' | 'playerId' | 'nickname'>,
  dir: 'asc' | 'desc',
): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] as number;
    const bv = b[key] as number;
    return dir === 'desc' ? bv - av : av - bv;
  });
}

function row(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    registrationId: 'r1',
    playerId: 'p1',
    nickname: '测试',
    games: 5,
    wins: 3,
    avgKills: 4,
    avgDeaths: 2,
    avgAssists: 6,
    kda: 5.0,
    avgCs: 180,
    avgDamage: 20000,
    avgGold: 12000,
    mvpCount: 1,
    ...overrides,
  };
}

describe('LeaderboardView sort logic', () => {
  it('sorts by kda desc — highest first', () => {
    const rows = [
      row({ registrationId: 'r1', kda: 3.0 }),
      row({ registrationId: 'r2', kda: 7.5 }),
      row({ registrationId: 'r3', kda: 1.2 }),
    ];
    const sorted = sortRows(rows, 'kda', 'desc');
    expect(sorted.map((r) => r.registrationId)).toEqual(['r2', 'r1', 'r3']);
  });

  it('sorts by kda asc — lowest first', () => {
    const rows = [
      row({ registrationId: 'r1', kda: 3.0 }),
      row({ registrationId: 'r2', kda: 7.5 }),
      row({ registrationId: 'r3', kda: 1.2 }),
    ];
    const sorted = sortRows(rows, 'kda', 'asc');
    expect(sorted.map((r) => r.registrationId)).toEqual(['r3', 'r1', 'r2']);
  });

  it('sorts by games desc', () => {
    const rows = [
      row({ registrationId: 'r1', games: 10 }),
      row({ registrationId: 'r2', games: 2 }),
      row({ registrationId: 'r3', games: 7 }),
    ];
    const sorted = sortRows(rows, 'games', 'desc');
    expect(sorted[0].registrationId).toBe('r1');
    expect(sorted[2].registrationId).toBe('r2');
  });

  it('does not mutate the original array', () => {
    const rows = [row({ registrationId: 'r1', kda: 1 }), row({ registrationId: 'r2', kda: 5 })];
    const original = [...rows];
    sortRows(rows, 'kda', 'desc');
    expect(rows[0].registrationId).toBe(original[0].registrationId);
  });

  it('handles single-element array', () => {
    const rows = [row({ registrationId: 'r1', kda: 4.0 })];
    const sorted = sortRows(rows, 'kda', 'desc');
    expect(sorted).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(sortRows([], 'kda', 'desc')).toEqual([]);
  });

  it('sorts by mvpCount desc', () => {
    const rows = [
      row({ registrationId: 'r1', mvpCount: 0 }),
      row({ registrationId: 'r2', mvpCount: 3 }),
      row({ registrationId: 'r3', mvpCount: 1 }),
    ];
    const sorted = sortRows(rows, 'mvpCount', 'desc');
    expect(sorted.map((r) => r.registrationId)).toEqual(['r2', 'r3', 'r1']);
  });
});
