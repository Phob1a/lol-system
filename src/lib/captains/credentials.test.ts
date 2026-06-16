import { describe, expect, it } from 'vitest';
import { generatePassword, generateUsername } from './credentials';

describe('credentials', () => {
  it('generateUsername produces a TEAM-prefixed code', () => {
    expect(generateUsername()).toMatch(/^TEAM-[0-9A-Z]{4}$/);
  });

  it('generateUsername is non-deterministic across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateUsername()));
    expect(set.size).toBeGreaterThan(40);
  });

  it('generatePassword produces a 10-char alphanumeric string', () => {
    expect(generatePassword()).toMatch(/^[0-9a-zA-Z]{10}$/);
  });
});
