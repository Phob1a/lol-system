import type { Player, Position } from '@prisma/client';
import { POSITIONS, type PositionLiteral } from '@/lib/players/schema';

export type PickedStatus = 'all' | 'picked' | 'unpicked';

export type PlayerFilter = {
  search?: string;
  primaryPositions?: PositionLiteral[];
  secondaryPositions?: PositionLiteral[];
  costMin?: number;
  costMax?: number;
  pickedStatus?: PickedStatus;
};

export type SortKey =
  | 'gameId-asc'
  | 'primary-asc'
  | 'cost-asc'
  | 'cost-desc';

export type PlayerForPool = Pick<
  Player,
  'id' | 'gameId' | 'nickname' | 'primaryPositions' | 'secondaryPositions' | 'cost'
> & {
  isCaptain?: boolean;
  isRetired?: boolean;
  isPicked?: boolean;
};

const POSITION_ORDER = new Map<Position, number>(
  POSITIONS.map((p, i) => [p as Position, i]),
);

function fuzzyMatch(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasIntersection<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  if (b.length === 0) return false;
  const set = new Set<string>(b);
  for (const x of a) if (set.has(x)) return true;
  return false;
}

export function filterPlayers<P extends PlayerForPool>(
  players: P[],
  filter: PlayerFilter,
): P[] {
  const search = filter.search?.trim();
  const primary = filter.primaryPositions ?? [];
  const secondary = filter.secondaryPositions ?? [];
  const status = filter.pickedStatus ?? 'all';

  return players.filter((p) => {
    if (search) {
      if (!fuzzyMatch(p.gameId, search) && !fuzzyMatch(p.nickname, search)) {
        return false;
      }
    }

    // Cross-group OR: when both primary and secondary filters are active,
    // a player passes if EITHER their primary positions match the chosen
    // primaries OR their secondary positions match the chosen secondaries.
    // When only one group is active, that group acts as a normal constraint.
    if (primary.length > 0 || secondary.length > 0) {
      const primaryMatch = primary.length > 0 && hasIntersection(p.primaryPositions, primary);
      const secondaryMatch = secondary.length > 0 && hasIntersection(p.secondaryPositions, secondary);
      if (!primaryMatch && !secondaryMatch) return false;
    }

    if (filter.costMin != null && p.cost < filter.costMin) return false;
    if (filter.costMax != null && p.cost > filter.costMax) return false;

    if (status === 'picked' && !p.isPicked) return false;
    if (status === 'unpicked' && p.isPicked) return false;

    return true;
  });
}

function comparePrimary(a: PlayerForPool, b: PlayerForPool): number {
  // Sort by the first (lowest-index) primary position each player has.
  const minIdx = (p: PlayerForPool) =>
    p.primaryPositions.length === 0
      ? POSITIONS.length
      : Math.min(
          ...p.primaryPositions.map((pos) => POSITION_ORDER.get(pos as Position) ?? POSITIONS.length),
        );
  return minIdx(a) - minIdx(b);
}

export function sortPlayers<P extends PlayerForPool>(
  players: P[],
  sortKey: SortKey,
): P[] {
  const arr = [...players];
  switch (sortKey) {
    case 'gameId-asc':
      arr.sort((a, b) => a.gameId.localeCompare(b.gameId));
      break;
    case 'primary-asc':
      arr.sort((a, b) => comparePrimary(a, b) || a.gameId.localeCompare(b.gameId));
      break;
    case 'cost-asc':
      arr.sort((a, b) => a.cost - b.cost || a.gameId.localeCompare(b.gameId));
      break;
    case 'cost-desc':
      arr.sort((a, b) => b.cost - a.cost || a.gameId.localeCompare(b.gameId));
      break;
  }
  return arr;
}

// Defaults exposed for UI bootstrap.
export const DEFAULT_FILTER: PlayerFilter = {
  search: '',
  primaryPositions: [],
  secondaryPositions: [],
  pickedStatus: 'all',
};

export const DEFAULT_SORT: SortKey = 'gameId-asc';
