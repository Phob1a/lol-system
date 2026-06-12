import { describe, expect, it } from 'vitest';
import { CreateSeasonInput } from './season-schema';

describe('CreateSeasonInput', () => {
  it('accepts a valid season', () => {
    expect(CreateSeasonInput.safeParse({ name: 'S1', teamBudget: 1000, tournament: { kind: '正赛', config: { template: 'group-knockout' } } }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(CreateSeasonInput.safeParse({ name: '', teamBudget: 1000 }).success).toBe(false);
  });

  it('rejects a non-positive budget', () => {
    expect(CreateSeasonInput.safeParse({ name: 'S1', teamBudget: 0 }).success).toBe(false);
  });
});
