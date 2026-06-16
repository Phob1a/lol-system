import { describe, expect, it } from 'vitest';
import { PublicRegistrationInput } from './registration-schema';

const base = {
  gameId: 'faker',
  nickname: '李哥',
  primaryPositions: ['MID'],
  secondaryPositions: [],
  currentRank: '大师',
  peakRank: '宗师',
  willingToCaptain: false,
};

describe('PublicRegistrationInput', () => {
  it('accepts a valid registration', () => {
    expect(PublicRegistrationInput.safeParse(base).success).toBe(true);
  });

  it('accepts omitted nickname and blank nickname', () => {
    const omitted = { ...base };
    delete (omitted as Partial<typeof base>).nickname;

    expect(PublicRegistrationInput.safeParse(omitted).success).toBe(true);
    expect(PublicRegistrationInput.safeParse({ ...base, nickname: '   ' }).success).toBe(true);
  });

  it('requires at least one primary position', () => {
    expect(PublicRegistrationInput.safeParse({ ...base, primaryPositions: [] }).success).toBe(false);
  });

  it('rejects a secondary position that duplicates a primary one', () => {
    const r = PublicRegistrationInput.safeParse({
      ...base, primaryPositions: ['MID'], secondaryPositions: ['MID'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a statement longer than 200 chars', () => {
    expect(PublicRegistrationInput.safeParse({ ...base, statement: 'x'.repeat(201) }).success).toBe(false);
  });
});
