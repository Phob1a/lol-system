import { expect, it } from 'vitest';
import {
  splitPlannerColumns,
  parallelCountAt,
  autoSequenceItems,
  type PlannerMatch,
} from './schedule-planner';

function mk(id: string, scheduledAt: string | null, status = 'SCHEDULED'): PlannerMatch {
  return { id, scheduledAt, status, version: 0 };
}

it('splitPlannerColumns：未排期入池，已排期按天分栏，排除 CANCELED', () => {
  const r = splitPlannerColumns([
    mk('u1', null),
    mk('x', '2026-07-01T08:00:00.000Z'),
    mk('y', '2026-07-01T10:00:00.000Z'),
    mk('c', '2026-07-02T08:00:00.000Z', 'CANCELED'),
    mk('u2', null, 'CANCELED'), // 取消的未排期也排除
  ]);
  expect(r.pool.map((m) => m.id)).toEqual(['u1']);
  expect(r.columns).toHaveLength(1); // 仅 07-01 一栏（07-02 那场被取消）
  expect(r.columns[0].matches.map((m) => m.id)).toEqual(['x', 'y']); // 时间升序
  expect(r.columns[0].count).toBe(2);
});

it('parallelCountAt：同天同 HH:mm 计数', () => {
  const ms = [
    mk('a', '2026-07-01T08:00:00.000Z'),
    mk('b', '2026-07-01T08:00:00.000Z'),
    mk('c', '2026-07-01T09:00:00.000Z'),
  ];
  // a 所在时段（08:00）并行 2 场
  expect(parallelCountAt(ms, ms[0])).toBe(2);
  expect(parallelCountAt(ms, ms[2])).toBe(1);
});

it('autoSequenceItems：起始时间 + 间隔 → 顺排 items', () => {
  const pool = [mk('p1', null), mk('p2', null), mk('p3', null)];
  const start = new Date('2026-07-05T13:00:00.000Z');
  const items = autoSequenceItems(pool, { start, intervalMinutes: 30 });
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ matchId: 'p1', expectedVersion: 0 });
  expect(new Date(items[0].scheduledAt!).getTime()).toBe(start.getTime());
  expect(new Date(items[1].scheduledAt!).getTime()).toBe(start.getTime() + 30 * 60_000);
  expect(new Date(items[2].scheduledAt!).getTime()).toBe(start.getTime() + 60 * 60_000);
});

it('autoSequenceItems：空池 → 空 items', () => {
  expect(autoSequenceItems([], { start: new Date(), intervalMinutes: 30 })).toEqual([]);
});
