import { describe, expect, it } from 'vitest';
import { commitSchema, resolvePid, summarySchema } from './import-schema';
import sampleWithPid from '@/lib/test/fixtures/sample-summary-with-pid.json';
import sample from '@/lib/test/fixtures/sample-summary.json';

describe('resolvePid', () => {
  it('top-level participantId wins over stats.participantId', () => {
    const player = { participantId: 3, stats: { participantId: 9 } };
    expect(resolvePid(player, 0)).toBe(3);
  });

  it('falls back to stats.participantId when no top-level participantId', () => {
    const player = { stats: { participantId: 7 } };
    expect(resolvePid(player, 0)).toBe(7);
  });

  it('falls back to index+1 when neither top-level nor stats.participantId is present', () => {
    const player = { stats: { kills: 5 } };
    expect(resolvePid(player, 4)).toBe(5);
  });
});

describe('summarySchema', () => {
  it('accepts a numeric gameId and transforms to BigInt', () => {
    const result = summarySchema.parse(sample);
    expect(typeof result.gameId).toBe('bigint');
    expect(result.gameId).toBe(BigInt(11026318983));
  });

  it('accepts a string gameId and transforms to BigInt', () => {
    const input = { ...sample, gameId: '11026318983' };
    const result = summarySchema.parse(input);
    expect(typeof result.gameId).toBe('bigint');
    expect(result.gameId).toBe(BigInt(11026318983));
  });

  it('parses sample-summary.json with 10 players', () => {
    const result = summarySchema.parse(sample);
    expect(result.players).toHaveLength(10);
  });

  it('parses sample-summary-with-pid.json (has top-level participantId)', () => {
    const result = summarySchema.parse(sampleWithPid);
    expect(result.players).toHaveLength(10);
    expect(result.players[0].participantId).toBe(1);
  });

  it('rejects when players count is not 10', () => {
    const bad = { ...sample, players: sample.players.slice(0, 5) };
    expect(() => summarySchema.parse(bad)).toThrow();
  });

  it('rejects a numeric gameId beyond safe integer range', () => {
    const bad = { ...sample, gameId: Number.MAX_SAFE_INTEGER + 1 };
    expect(() => summarySchema.parse(bad)).toThrow();
  });

  it('accepts a large gameId only via string and converts exactly to BigInt', () => {
    const input = { ...sample, gameId: '9007199254740993' }; // MAX_SAFE_INTEGER + 2
    const result = summarySchema.parse(input);
    expect(result.gameId).toBe(9007199254740993n);
  });
});

describe('commitSchema', () => {
  it('rejects manual stat overrides; import review may only change mappings', () => {
    const body = {
      matchId: 'match1',
      expectedVersion: 1,
      gameIndex: 1,
      blueTeamId: 'team1',
      mappings: Array.from({ length: 10 }, (_, i) => ({
        capturedParticipantId: i + 1,
        registrationId: `reg-${i + 1}`,
      })),
      overrides: { 1: { kills: 99 } },
    };

    expect(() => commitSchema.parse(body)).toThrow();
  });
});
