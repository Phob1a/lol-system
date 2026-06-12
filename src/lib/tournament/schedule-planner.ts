import { groupMatchesByDay, type DayGroup } from './schedule-grouping';

export type PlannerMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  version: number;
};

export type PlannerColumn<M extends PlannerMatch> = DayGroup<M>;

export type RescheduleItem = {
  matchId: string;
  expectedVersion: number;
  scheduledAt: string | null;
};

export function splitPlannerColumns<M extends PlannerMatch>(
  matches: M[],
): { pool: M[]; columns: PlannerColumn<M>[] } {
  const active = matches.filter((m) => m.status !== 'CANCELED');
  const pool = active.filter((m) => m.scheduledAt === null);
  const scheduled = active.filter((m) => m.scheduledAt !== null);
  return { pool, columns: groupMatchesByDay(scheduled) };
}

export function parallelCountAt<M extends PlannerMatch>(matches: M[], target: M): number {
  if (target.scheduledAt === null) return 0;
  const key = slotKey(target.scheduledAt);
  return matches.filter((m) => m.scheduledAt !== null && slotKey(m.scheduledAt) === key).length;
}

export function autoSequenceItems<M extends PlannerMatch>(
  pool: M[],
  opts: { start: Date; intervalMinutes: number },
): RescheduleItem[] {
  return pool.map((m, i) => ({
    matchId: m.id,
    expectedVersion: m.version,
    scheduledAt: new Date(opts.start.getTime() + i * opts.intervalMinutes * 60_000).toISOString(),
  }));
}

function slotKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
