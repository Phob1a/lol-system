import { expect, it } from 'vitest';
import { scheduleBatchSchema } from './schedule-batch-schema';

const ok = { matchId: 'm1', expectedVersion: 0, scheduledAt: '2026-07-01T10:00:00.000Z' };

it('接受合法 body（含 scheduledAt=null）', () => {
  const r = scheduleBatchSchema.safeParse({ items: [ok, { matchId: 'm2', expectedVersion: 3, scheduledAt: null }] });
  expect(r.success).toBe(true);
});

it('拒绝空数组', () => {
  expect(scheduleBatchSchema.safeParse({ items: [] }).success).toBe(false);
});

it('拒绝超 200 项', () => {
  const items = Array.from({ length: 201 }, () => ok);
  expect(scheduleBatchSchema.safeParse({ items }).success).toBe(false);
});

it('拒绝非法 datetime', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, scheduledAt: 'not-a-date' }] }).success).toBe(false);
});

it('拒绝 expectedVersion 非整数', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, expectedVersion: 1.5 }] }).success).toBe(false);
});

it('拒绝 matchId 为空字符串', () => {
  expect(scheduleBatchSchema.safeParse({ items: [{ ...ok, matchId: '' }] }).success).toBe(false);
});
