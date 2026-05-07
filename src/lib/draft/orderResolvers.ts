import type { RoundMode } from '@prisma/client';

export type CaptainSnapshot = {
  id: string;
  budgetLeft: number;
};

export type ResolveOrderInput = {
  mode: RoundMode;
  captains: CaptainSnapshot[];
  prevRoundOrder?: string[];
  adminProvidedOrder?: string[];
  /** Injected for tests; defaults to Math.random. */
  rng?: () => number;
};

export class OrderResolverError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'OrderResolverError';
  }
}

/**
 * Compute the pick order for a round. Pure function; no DB access.
 * Per the user's R1 decision, the resulting order is frozen for the round —
 * subsequent picks/revokes do NOT recompute it.
 */
export function resolveOrder(input: ResolveOrderInput): string[] {
  const { mode, captains } = input;
  const rng = input.rng ?? Math.random;

  switch (mode) {
    case 'MANUAL':
      // For manual assignment the "order" is a record of captains involved,
      // not a sequence captains pick in. Default to admin-provided or all captains.
      return validateOrder(input.adminProvidedOrder ?? captains.map((c) => c.id), captains);

    case 'ADMIN_ORDER':
      if (!input.adminProvidedOrder) {
        throw new OrderResolverError('MISSING_ORDER', 'ADMIN_ORDER 模式需要管理员提供顺序');
      }
      return validateOrder(input.adminProvidedOrder, captains);

    case 'REVERSE_LAST':
      if (!input.prevRoundOrder) {
        throw new OrderResolverError('MISSING_PREV_ORDER', 'REVERSE_LAST 模式需要上一轮顺序');
      }
      return validateOrder([...input.prevRoundOrder].reverse(), captains);

    case 'BUDGET_DESC':
      return resolveBudgetDesc(captains, rng);

    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      throw new OrderResolverError('UNKNOWN_MODE', `未知模式: ${String(mode)}`);
    }
  }
}

function validateOrder(order: string[], captains: CaptainSnapshot[]): string[] {
  const captainIds = new Set(captains.map((c) => c.id));
  if (order.length !== captainIds.size) {
    throw new OrderResolverError(
      'ORDER_MISMATCH',
      `顺序长度 ${order.length} 与队长数量 ${captainIds.size} 不一致`,
    );
  }
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) {
      throw new OrderResolverError('ORDER_DUP', `顺序中重复出现 ${id}`);
    }
    if (!captainIds.has(id)) {
      throw new OrderResolverError('ORDER_UNKNOWN_CAPTAIN', `顺序中含未知队长 ${id}`);
    }
    seen.add(id);
  }
  return order;
}

/**
 * BUDGET_DESC: group captains by budget tier (desc), shuffle ties via
 * Fisher-Yates using the supplied RNG. Tests inject a deterministic RNG.
 */
function resolveBudgetDesc(captains: CaptainSnapshot[], rng: () => number): string[] {
  const grouped = new Map<number, string[]>();
  for (const c of captains) {
    if (!grouped.has(c.budgetLeft)) grouped.set(c.budgetLeft, []);
    grouped.get(c.budgetLeft)!.push(c.id);
  }
  const tiers = [...grouped.keys()].sort((a, b) => b - a);
  const out: string[] = [];
  for (const tier of tiers) {
    const ids = grouped.get(tier)!;
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    out.push(...ids);
  }
  return out;
}

/** Deterministic RNG for testing (mulberry32). */
export function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
