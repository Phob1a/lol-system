import { describe, it, expect } from 'vitest';
import { computeStandings, type StandingMatch } from './standings-service';

const finished = (
  id: string, gId: string, a: string, b: string, winner: string,
  phase: 'GROUP' | 'TIEBREAKER' = 'GROUP',
): StandingMatch => ({
  id, phase, groupId: gId, status: 'FINISHED',
  teamAId: a, teamBId: b, winnerTeamId: winner,
});

describe('computeStandings', () => {
  it('all-distinct wins → ordered by wins desc', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T1', 'T3', 'T1'),
      finished('m3', 'g1', 'T1', 'T4', 'T1'),
      finished('m4', 'g1', 'T2', 'T3', 'T2'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.map(r => r.teamId)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(s.tieGroups).toEqual([]);
  });

  it('two-team tie resolved by head-to-head', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'), // T1 beats T2 head-to-head
      finished('m2', 'g1', 'T1', 'T3', 'T3'),
      finished('m3', 'g1', 'T1', 'T4', 'T1'),
      finished('m4', 'g1', 'T2', 'T3', 'T2'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T4'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.slice(0, 2).map(r => r.teamId)).toEqual(['T1', 'T2']);
    expect(s.tieGroups).toEqual([]);
  });

  it('three-team cyclic tie → flagged as unresolved', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T2', 'T3', 'T2'),
      finished('m3', 'g1', 'T3', 'T1', 'T3'),
      finished('m4', 'g1', 'T1', 'T4', 'T1'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
    ];
    const s = computeStandings(matches);
    expect(s.tieGroups).toHaveLength(1);
    expect(s.tieGroups[0].groupId).toBe('g1');
    expect(s.tieGroups[0].tiedTeamIds.sort()).toEqual(['T1', 'T2', 'T3']);
  });

  it('tiebreaker matches resolve a cyclic tie', () => {
    const matches: StandingMatch[] = [
      finished('m1', 'g1', 'T1', 'T2', 'T1'),
      finished('m2', 'g1', 'T2', 'T3', 'T2'),
      finished('m3', 'g1', 'T3', 'T1', 'T3'),
      finished('m4', 'g1', 'T1', 'T4', 'T1'),
      finished('m5', 'g1', 'T2', 'T4', 'T2'),
      finished('m6', 'g1', 'T3', 'T4', 'T3'),
      finished('tb1', 'g1', 'T1', 'T2', 'T1', 'TIEBREAKER'),
      finished('tb2', 'g1', 'T2', 'T3', 'T2', 'TIEBREAKER'),
    ];
    const s = computeStandings(matches);
    expect(s.byGroup.g1.slice(0, 3).map(r => r.teamId)).toEqual(['T1', 'T2', 'T3']);
    expect(s.tieGroups).toEqual([]);
  });

  it('WALKOVER counts as a win for the winner', () => {
    const matches: StandingMatch[] = [{
      id: 'm1', phase: 'GROUP', groupId: 'g1', status: 'WALKOVER',
      teamAId: 'T1', teamBId: 'T2', winnerTeamId: 'T1',
    }];
    const s = computeStandings(matches);
    const t1 = s.byGroup.g1.find(r => r.teamId === 'T1')!;
    expect(t1.wins).toBe(1);
  });
});
