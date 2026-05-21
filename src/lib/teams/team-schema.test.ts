import { describe, expect, it } from 'vitest';
import { UpdateTeamProfileInput } from './team-schema';

describe('UpdateTeamProfileInput', () => {
  it('accepts a valid name and slogan', () => {
    const r = UpdateTeamProfileInput.parse({ name: '疾风战队', slogan: '永不言败' });
    expect(r).toEqual({ name: '疾风战队', slogan: '永不言败' });
  });

  it('normalizes an empty slogan to null', () => {
    expect(UpdateTeamProfileInput.parse({ name: '队名', slogan: '   ' }).slogan).toBeNull();
  });

  it('normalizes a missing slogan to null', () => {
    expect(UpdateTeamProfileInput.parse({ name: '队名' }).slogan).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(UpdateTeamProfileInput.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name longer than 20 chars', () => {
    expect(UpdateTeamProfileInput.safeParse({ name: 'x'.repeat(21) }).success).toBe(false);
  });

  it('rejects a slogan longer than 50 chars', () => {
    expect(
      UpdateTeamProfileInput.safeParse({ name: '队名', slogan: 'x'.repeat(51) }).success,
    ).toBe(false);
  });
});
