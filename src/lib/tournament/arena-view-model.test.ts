import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/hooks/useTournamentState';
import {
  formatArenaDateTime,
  getArenaStats,
  getHotSignals,
  getNextMatch,
  getTournamentHeadline,
} from './arena-view-model';

type State = NonNullable<PublicState>;
type Match = State['matches'][number];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    label: '小组赛 R1',
    roundKey: 'GROUP',
    bestOf: 1,
    scheduledAt: '2026-07-01T12:00:00.000Z',
    status: 'SCHEDULED',
    isWalkover: false,
    teamA: { id: 'ta', name: '蓝队' },
    teamB: { id: 'tb', name: '红队' },
    winnerTeamId: null,
    groupId: 'g1',
    ...overrides,
  };
}

function state(overrides: Partial<State> = {}): State {
  return {
    tournament: { id: 't1', name: '夏季联赛', kind: 'GROUP_KNOCKOUT', status: 'ACTIVE' },
    matches: [match()],
    standings: [
      {
        groupId: 'g1',
        name: 'A组',
        teams: { ta: '蓝队', tb: '红队', tc: '金队' },
        rows: [
          { teamId: 'ta', played: 2, wins: 2, losses: 0, points: 6, rank: 1, tied: false },
          { teamId: 'tb', played: 2, wins: 1, losses: 1, points: 3, rank: 2, tied: false },
        ],
      },
    ],
    bracket: [
      {
        roundKey: 'SEMIFINAL',
        matches: [
          {
            id: 'b1',
            label: '半决赛 1',
            teamAId: 'ta',
            teamBId: 'tb',
            winnerTeamId: null,
            status: 'SCHEDULED',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('arena view model', () => {
  it('selects the nearest future scheduled non-finished match', () => {
    const now = new Date('2026-07-01T10:00:00.000Z');
    const result = getNextMatch(
      [
        match({ id: 'past', scheduledAt: '2026-07-01T09:00:00.000Z' }),
        match({ id: 'finished', scheduledAt: '2026-07-01T11:00:00.000Z', status: 'FINISHED' }),
        match({ id: 'next', scheduledAt: '2026-07-01T12:00:00.000Z' }),
        match({ id: 'later', scheduledAt: '2026-07-01T16:00:00.000Z' }),
      ],
      now,
    );

    expect(result?.id).toBe('next');
  });

  it('returns null when there is no upcoming scheduled match', () => {
    expect(
      getNextMatch(
        [
          match({ id: 'done', status: 'FINISHED' }),
          match({ id: 'draft', scheduledAt: null }),
        ],
        new Date('2026-07-01T10:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('derives conservative arena stats without duplicate teams', () => {
    expect(
      getArenaStats(
        state({
          matches: [
            match({ id: 'm1', status: 'FINISHED', teamA: { id: 'ta', name: '蓝队' } }),
            match({
              id: 'm2',
              status: 'SCHEDULED',
              teamA: { id: 'ta', name: '蓝队' },
              teamB: { id: 'tc', name: '金队' },
            }),
            match({ id: 'm3', status: 'IN_PROGRESS', teamA: null, teamB: null }),
          ],
        }),
      ),
    ).toEqual({
      totalMatches: 3,
      completedMatches: 1,
      scheduledMatches: 1,
      pendingMatches: 1,
      liveMatches: 1,
      progressPercent: 33,
      teamCount: 3,
      groupCount: 1,
      bracketRoundCount: 1,
    });
  });

  it('generates active headline copy with a next-match CTA', () => {
    const headline = getTournamentHeadline(state(), new Date('2026-07-01T10:00:00.000Z'));

    expect(headline.title).toBe('夏季联赛进入公共竞技场');
    expect(headline.primaryCtaLabel).toBe('观看下一场');
    expect(headline.primaryCtaHref).toBe('/tournament/match/m1');
  });

  it('generates finished headline copy when every match is complete', () => {
    const headline = getTournamentHeadline(
      state({
        matches: [match({ id: 'm1', status: 'FINISHED' })],
      }),
      new Date('2026-07-02T10:00:00.000Z'),
    );

    expect(headline.title).toBe('夏季联赛赛果已归档');
    expect(headline.primaryCtaLabel).toBe('查看数据榜');
    expect(headline.primaryCtaHref).toBe('#leaderboard');
  });

  it('keeps hot signals grounded in existing event data', () => {
    const signals = getHotSignals(state(), new Date('2026-07-01T10:00:00.000Z'));

    expect(signals.map((signal) => signal.id)).toEqual([
      'next-match',
      'leader',
      'bracket',
      'schedule',
    ]);
    expect(signals[0].value).toBe('蓝队 vs 红队');
  });

  it('formats arena date-times and sparse values', () => {
    expect(formatArenaDateTime('2026-07-01T12:00:00.000Z')).toMatch(/07\/01|7\/1/);
    expect(formatArenaDateTime(null)).toBe('待同步');
  });
});
