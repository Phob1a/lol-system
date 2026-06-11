import { describe, expect, it } from 'vitest';
import { formatCost, normalizeCost } from './costs';

describe('cost helpers', () => {
  it('formats binary floating point residue as a human cost', () => {
    expect(formatCost(0.09999999999999876)).toBe('0.1');
    expect(formatCost(5.299999999999999)).toBe('5.3');
  });

  it('keeps up to two decimal places for valid cost values', () => {
    expect(formatCost(7.99)).toBe('7.99');
    expect(formatCost(4)).toBe('4');
    expect(normalizeCost(33.5 - 33.4)).toBe(0.1);
  });
});
