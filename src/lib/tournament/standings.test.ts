import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsMatch } from './standings';

const m = (a: string, b: string, winner: string | null, over: Partial<StandingsMatch> = {}): StandingsMatch => ({
  teamAId: a, teamBId: b, winnerTeamId: winner,
  status: winner ? 'FINISHED' : 'SCHEDULED',
  countsForStandings: true,
  ...over,
});

describe('computeStandings', () => {
  it('胜1负0；按积分排序', () => {
    const rows = computeStandings(['t1', 't2', 't3'], [
      m('t1', 't2', 't1'), m('t1', 't3', 't1'), m('t2', 't3', 't2'),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['t1', 't2', 't3']);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 0, points: 2, rank: 1, tied: false });
  });

  it('三队连环同分 → 全部标 tied', () => {
    const rows = computeStandings(['t1', 't2', 't3'], [
      m('t2', 't1', 't2'), m('t1', 't3', 't1'), m('t2', 't3', 't3'),
    ]);
    expect(rows.every((r) => r.tied)).toBe(true);
  });

  it('同分头对头可分 → 不标 tied', () => {
    const rows = computeStandings(['t1', 't2', 't3', 't4'], [
      m('t1', 't2', 't1'), m('t3', 't4', 't3'),
      m('t1', 't3', 't1'), m('t2', 't4', 't2'),
      m('t1', 't4', 't1'), m('t2', 't3', 't2'),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['t1', 't2', 't3', 't4']);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it('WALKOVER 计分、CANCELED 与 countsForStandings=false 不计', () => {
    const rows = computeStandings(['t1', 't2'], [
      m('t1', 't2', 't1', { status: 'WALKOVER' }),
      m('t1', 't2', 't2', { status: 'CANCELED' }),
      m('t1', 't2', 't2', { countsForStandings: false }),
    ]);
    expect(rows[0]).toMatchObject({ teamId: 't1', points: 1 });
    expect(rows[1]).toMatchObject({ teamId: 't2', points: 0 });
  });
});
