import { groupMatchesByDay, type DayGroup } from './schedule-grouping';

/** 排期面板所需 match 形状（管理读模型 AdminMatch 满足：id/scheduledAt/status/version）。 */
export type PlannerMatch = { id: string; scheduledAt: string | null; status: string; version: number };

export type PlannerColumn<M extends PlannerMatch> = DayGroup<M>;

export type RescheduleItem = { matchId: string; expectedVersion: number; scheduledAt: string | null };

/** 拆为未排期池 + 按天分栏。排除 status==='CANCELED'。 */
export function splitPlannerColumns<M extends PlannerMatch>(
  matches: M[],
): { pool: M[]; columns: PlannerColumn<M>[] } {
  const active = matches.filter((m) => m.status !== 'CANCELED');
  const pool = active.filter((m) => m.scheduledAt === null);
  const scheduled = active.filter((m) => m.scheduledAt !== null);
  // groupMatchesByDay 对全有时间的输入返回纯日期栏（无 pending 区块）
  const columns = groupMatchesByDay(scheduled);
  return { pool, columns };
}

/** target 同天同 HH:mm 的并行场次数（含自身）。target.scheduledAt 必须非空。 */
export function parallelCountAt<M extends PlannerMatch>(matches: M[], target: M): number {
  if (target.scheduledAt === null) return 0;
  const slot = (s: string) => {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const key = slot(target.scheduledAt);
  return matches.filter((m) => m.scheduledAt !== null && slot(m.scheduledAt) === key).length;
}

/** 自动顺排：从 start 起按 intervalMinutes 依次给 pool 排期，生成 batch items（按池顺序）。 */
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
