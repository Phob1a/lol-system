/** 时间线分组所需的最小 match 形状（公开 + 管理读模型都满足）。 */
export type SchedulableMatch = { id: string; scheduledAt: string | null };

export type DayGroup<M extends SchedulableMatch> = {
  /** 排序键：有时间 = 'YYYY-MM-DD'（本地）；待定 = '￿' 保证置底。 */
  dayKey: string;
  /** 展示标签：'2026年7月1日 周三'；待定 = '时间待定'。 */
  label: string;
  /** 该天比赛数。 */
  count: number;
  /** 是否为「时间待定」区块。 */
  isPending: boolean;
  /** 当天比赛，按 scheduledAt 升序（待定区块保持输入顺序）。 */
  matches: M[];
};

const PENDING_KEY = '￿';
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY[d.getDay()]}`;
}

/**
 * 公开/管理时间线：按本地日期分组。
 * - 有时间的天按日期升序在前；当天按 scheduledAt 升序。
 * - scheduledAt==null 归「时间待定」单一区块，置最底。
 * 纯函数，无副作用，可单测。
 */
export function groupMatchesByDay<M extends SchedulableMatch>(matches: M[]): DayGroup<M>[] {
  const buckets = new Map<string, { label: string; isPending: boolean; matches: M[] }>();

  for (const m of matches) {
    if (m.scheduledAt === null) {
      const b = buckets.get(PENDING_KEY) ?? { label: '时间待定', isPending: true, matches: [] };
      b.matches.push(m);
      buckets.set(PENDING_KEY, b);
      continue;
    }
    const d = new Date(m.scheduledAt);
    const key = localDayKey(d);
    const b = buckets.get(key) ?? { label: dayLabel(d), isPending: false, matches: [] };
    b.matches.push(m);
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b)) // PENDING_KEY = '￿' 自然置底
    .map(([dayKey, b]) => ({
      dayKey,
      label: b.label,
      isPending: b.isPending,
      count: b.matches.length,
      matches: b.isPending
        ? b.matches
        : [...b.matches].sort(
            (x, y) => new Date(x.scheduledAt!).getTime() - new Date(y.scheduledAt!).getTime(),
          ),
    }));
}
