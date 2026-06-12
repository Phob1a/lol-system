import { expect, it } from 'vitest';
import { groupMatchesByDay, type SchedulableMatch } from './schedule-grouping';

function mk(id: string, scheduledAt: string | null): SchedulableMatch {
  return { id, scheduledAt };
}

it('按本地日期分组，跨天升序，当天按时间升序', () => {
  const matches = [
    mk('b', '2026-07-02T09:00:00.000Z'),
    mk('a2', '2026-07-01T15:00:00.000Z'),
    mk('a1', '2026-07-01T08:00:00.000Z'),
  ];
  const groups = groupMatchesByDay(matches);
  // 第一天 = 07-01，含 a1 then a2（时间升序）；第二天 = 07-02
  expect(groups[0].matches.map((m) => m.id)).toEqual(['a1', 'a2']);
  expect(groups[1].matches.map((m) => m.id)).toEqual(['b']);
  expect(groups[0].count).toBe(2);
  expect(groups[0].isPending).toBe(false);
});

it('label 含日期与星期', () => {
  const groups = groupMatchesByDay([mk('a', '2026-07-01T08:00:00.000Z')]);
  expect(groups[0].label).toMatch(/2026/);
  expect(groups[0].label).toMatch(/(周|星期)/);
});

it('时间待定（scheduledAt=null）归一个区块且置最底', () => {
  const matches = [
    mk('p1', null),
    mk('d', '2026-07-03T08:00:00.000Z'),
    mk('p2', null),
  ];
  const groups = groupMatchesByDay(matches);
  const last = groups[groups.length - 1];
  expect(last.isPending).toBe(true);
  expect(last.matches.map((m) => m.id).sort()).toEqual(['p1', 'p2']);
  expect(last.count).toBe(2);
  // 有时间的天在前
  expect(groups[0].isPending).toBe(false);
});

it('空输入 → 空数组', () => {
  expect(groupMatchesByDay([])).toEqual([]);
});

it('全部待定 → 单个 pending 区块', () => {
  const groups = groupMatchesByDay([mk('a', null), mk('b', null)]);
  expect(groups).toHaveLength(1);
  expect(groups[0].isPending).toBe(true);
});
