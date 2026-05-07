import { describe, expect, it } from 'vitest';
import {
  resolveOrder,
  seededRng,
  OrderResolverError,
  type CaptainSnapshot,
} from './orderResolvers';

const captains: CaptainSnapshot[] = [
  { id: 'A', budgetLeft: 800 },
  { id: 'B', budgetLeft: 700 },
  { id: 'C', budgetLeft: 800 }, // tied with A
  { id: 'D', budgetLeft: 600 },
];

describe('resolveOrder · MANUAL', () => {
  it('defaults to all captain ids when no order provided', () => {
    expect(resolveOrder({ mode: 'MANUAL', captains })).toEqual(['A', 'B', 'C', 'D']);
  });
  it('accepts admin-provided order', () => {
    expect(resolveOrder({ mode: 'MANUAL', captains, adminProvidedOrder: ['B', 'A', 'D', 'C'] }))
      .toEqual(['B', 'A', 'D', 'C']);
  });
});

describe('resolveOrder · ADMIN_ORDER', () => {
  it('returns admin-provided order', () => {
    expect(resolveOrder({ mode: 'ADMIN_ORDER', captains, adminProvidedOrder: ['D', 'C', 'B', 'A'] }))
      .toEqual(['D', 'C', 'B', 'A']);
  });
  it('throws if admin order missing', () => {
    expect(() => resolveOrder({ mode: 'ADMIN_ORDER', captains })).toThrow(OrderResolverError);
  });
  it('throws on duplicate captain in order', () => {
    expect(() =>
      resolveOrder({ mode: 'ADMIN_ORDER', captains, adminProvidedOrder: ['A', 'A', 'B', 'C'] }),
    ).toThrow(/重复/);
  });
  it('throws on unknown captain', () => {
    expect(() =>
      resolveOrder({ mode: 'ADMIN_ORDER', captains, adminProvidedOrder: ['A', 'B', 'C', 'X'] }),
    ).toThrow(/未知/);
  });
  it('throws on length mismatch', () => {
    expect(() =>
      resolveOrder({ mode: 'ADMIN_ORDER', captains, adminProvidedOrder: ['A', 'B'] }),
    ).toThrow(/不一致/);
  });
});

describe('resolveOrder · REVERSE_LAST', () => {
  it('reverses previous order', () => {
    expect(
      resolveOrder({
        mode: 'REVERSE_LAST',
        captains,
        prevRoundOrder: ['B', 'D', 'A', 'C'],
      }),
    ).toEqual(['C', 'A', 'D', 'B']);
  });
  it('throws if prev order missing', () => {
    expect(() => resolveOrder({ mode: 'REVERSE_LAST', captains })).toThrow(OrderResolverError);
  });
});

describe('resolveOrder · BUDGET_DESC', () => {
  it('orders strictly by budget desc when no ties', () => {
    const cs: CaptainSnapshot[] = [
      { id: 'X', budgetLeft: 100 },
      { id: 'Y', budgetLeft: 300 },
      { id: 'Z', budgetLeft: 200 },
    ];
    expect(resolveOrder({ mode: 'BUDGET_DESC', captains: cs })).toEqual(['Y', 'Z', 'X']);
  });

  it('shuffles ties using injected RNG (deterministic)', () => {
    // A & C tied at 800, B at 700, D at 600 -> [A,C,B,D] or [C,A,B,D] depending on shuffle
    const r1 = resolveOrder({ mode: 'BUDGET_DESC', captains, rng: seededRng(1) });
    const r2 = resolveOrder({ mode: 'BUDGET_DESC', captains, rng: seededRng(1) });
    expect(r1).toEqual(r2); // determinism
    expect(r1.slice(2)).toEqual(['B', 'D']); // non-tied portion stable
    expect(new Set(r1.slice(0, 2))).toEqual(new Set(['A', 'C'])); // tied pair top-2
  });

  it('different seeds can produce different tie orders', () => {
    const orderings = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const r = resolveOrder({ mode: 'BUDGET_DESC', captains, rng: seededRng(s) });
      orderings.add(r.slice(0, 2).join(','));
    }
    // We expect both 'A,C' and 'C,A' to appear across 20 seeds.
    expect(orderings.size).toBe(2);
  });
});
