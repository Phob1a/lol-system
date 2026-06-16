const COST_DECIMAL_PLACES = 2;
const COST_SCALE = 10 ** COST_DECIMAL_PLACES;

export function normalizeCost(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round((value + Number.EPSILON) * COST_SCALE) / COST_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatCost(value: number): string {
  const normalized = normalizeCost(value);
  if (!Number.isFinite(normalized)) return String(value);
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: COST_DECIMAL_PLACES,
    useGrouping: false,
  });
}

export function debitCost(budget: number, cost: number): number {
  return normalizeCost(budget - cost);
}

export function creditCost(budget: number, cost: number): number {
  return normalizeCost(budget + cost);
}
