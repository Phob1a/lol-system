# 选手清单(PlayerPool)布局重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把选秀控制台左栏的选手清单(`PlayerPool`)重构为折叠式筛选 + 全中文 + 更低密度的清爽布局。

**Architecture:** 纯视觉重构,只改 `src/components/draft/PlayerPool.tsx` 一个文件。筛选面板改为「搜索 + 状态条」常驻、其余条件收进可展开面板;所有英文标签本地化为中文;选手卡片由会在窄栏溢出的 `minmax(280px)` 网格改为单列纵向列表;字号从 8–10px 提到 11–13px。组件的 props、`filter`/`sort` state、`filterPlayers`/`sortPlayers`/`togglePos`/`reset`/`renderActions` 行为完全不变 —— 唯一新增的是 `filtersOpen` 这个纯展示用本地 state。

**Tech Stack:** Next.js 15 / React 18 / TypeScript / Tailwind CSS / shadcn/ui(`Input`、`Badge`)。

设计依据:`docs/superpowers/specs/2026-05-21-player-pool-layout-refactor-design.md`。

---

## 背景:为什么这样改

`PlayerPool` 渲染在 `BroadcastLayout` 的左栏(`lg:w-1/5`,约 280px 宽),被 `DraftControl`(管理员)、`CaptainDashboard`(队长)、`SpectatorView`(观众)三处共用。当前问题:筛选面板把十余个控件挤在窄栏里换行错位;`BY ID`/`COST ↑`/`PRIMARY (OR)` 等英文标签与系统其余中文界面不一致;大量 8–10px 小字观感杂乱;选手卡片网格用 `repeat(auto-fill, minmax(280px,1fr))`,280px 轨道在窄栏里溢出。

**关键约束:** 这是视觉重构。不写新单元测试 —— 项目测试覆盖 service 与纯函数,不覆盖 UI(详见 spec §5)。验证靠 `typecheck` + 既有测试维持 68/68(回归护栏)+ 浏览器冒烟。

`filterPlayers`、`sortPlayers`、`DEFAULT_FILTER`、`DEFAULT_SORT`(值为 `'gameId-asc'`)、`RegistrationForPool`、`PlayerFilter`、`SortKey` 均来自 `@/lib/filters`,本次不改动。`POSITION_OPTIONS`(`{ value, label }`,label 为「上单/打野/中单/射手/辅助」)来自 `@/components/players/positions`,不改动。

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/components/draft/PlayerPool.tsx` | 整体重写 | 选手清单组件 —— 折叠式筛选区 + 单列卡片列表 |

无新增文件、无新增依赖。`DraftControl.tsx` / `CaptainDashboard.tsx` / `SpectatorView.tsx` 对 `PlayerPool` 的用法不变,无需改动。

---

## Task 1: 重写 PlayerPool 组件

**Files:**
- Modify(整体重写): `src/components/draft/PlayerPool.tsx`

本任务用下面的完整文件内容替换 `src/components/draft/PlayerPool.tsx`。新内容相对旧版的差异:`SORT_OPTIONS` 标签中文化;新增 `PICKED_OPTIONS`、`POS_CHAR`(中文单字位置标记,替换旧的 `POS_LETTER`)、`FilterChip` 分段按钮组件;`PosChip` 去掉未使用的 `dim` 参数、改用中文单字、尺寸放大;新增 `filtersOpen` state 与 `activeFilterCount`;筛选面板改为折叠式;卡片容器由 grid 改为单列 flex;旧的独立 `NumField` 组件被内联进「费用区间」一行(占位符「最低」「最高」)并删除。props、`filter`/`sort` state、`filterPlayers`/`sortPlayers`/`togglePos`/`reset` 行为不变。

- [ ] **Step 1: 用以下完整内容替换 `src/components/draft/PlayerPool.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  filterPlayers,
  sortPlayers,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type RegistrationForPool,
  type PlayerFilter,
  type SortKey,
} from '@/lib/filters';
import type { PositionLiteral } from '@/lib/players/schema';
import { POSITION_OPTIONS } from '@/components/players/positions';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  players: RegistrationForPool[];
  /** Per-row action area (e.g. "选他" button when on the clock). */
  renderActions?: (player: RegistrationForPool) => React.ReactNode;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gameId-asc', label: '默认' },
  { value: 'primary-asc', label: '按位置' },
  { value: 'cost-asc', label: '费用 ↑' },
  { value: 'cost-desc', label: '费用 ↓' },
];

const PICKED_OPTIONS: { value: NonNullable<PlayerFilter['pickedStatus']>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unpicked', label: '未选' },
  { value: 'picked', label: '已选' },
];

/** Chinese single-character marker for a position value. */
const POS_CHAR: Record<string, string> = {
  TOP: '上',
  JG: '野',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUP: '辅',
  SUPPORT: '辅',
};

function PosChip({ pos, filled }: { pos: string; filled?: boolean }) {
  const char = POS_CHAR[pos] ?? pos[0];
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-medium',
        filled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-transparent text-muted-foreground',
      )}
    >
      {char}
    </span>
  );
}

/** Segmented toggle button used across the filter panel. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-transparent text-muted-foreground hover:border-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function PlayerPool({ players, renderActions }: Props) {
  const [filter, setFilter] = useState<PlayerFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visible = useMemo(
    () => sortPlayers(filterPlayers(players, filter), sort),
    [players, filter, sort],
  );

  // Count of active conditions inside the collapsible panel. Search is excluded
  // (it stays visible above); sort is not a "filter" and is not counted.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if ((filter.primaryPositions?.length ?? 0) > 0) n++;
    if ((filter.secondaryPositions?.length ?? 0) > 0) n++;
    if (filter.costMin != null) n++;
    if (filter.costMax != null) n++;
    if ((filter.pickedStatus ?? 'all') !== 'all') n++;
    return n;
  }, [filter]);

  function togglePos(field: 'primaryPositions' | 'secondaryPositions', pos: PositionLiteral) {
    setFilter((f) => {
      const cur = f[field] ?? [];
      const next = cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos];
      return { ...f, [field]: next };
    });
  }

  function reset() {
    setFilter(DEFAULT_FILTER);
    setSort(DEFAULT_SORT);
  }

  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      {/* ── Filter region ── */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        {/* Search — always visible */}
        <Input
          placeholder="搜索昵称 / 游戏 ID"
          value={filter.search ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          className="h-9 text-sm"
        />

        {/* Status bar: count · 筛选 toggle · 重置 */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">未选 {visible.length}</span> / {players.length} 人
          </span>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded border px-2.5 py-1 transition-colors',
              filtersOpen
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            筛选 {filtersOpen ? '▴' : '▾'}
            {activeFilterCount > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium',
                  filtersOpen
                    ? 'bg-primary-foreground text-primary'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            重置
          </button>
        </div>

        {/* Collapsible filter panel */}
        {filtersOpen && (
          <div className="space-y-3 border-t pt-3">
            {/* Sort */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">排序</p>
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={sort === opt.value}
                    onClick={() => setSort(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Primary positions */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">主位置</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITION_OPTIONS.map((p) => (
                  <FilterChip
                    key={p.value}
                    active={!!filter.primaryPositions?.includes(p.value)}
                    onClick={() => togglePos('primaryPositions', p.value)}
                  >
                    {p.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Secondary positions */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">副位置</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITION_OPTIONS.map((p) => (
                  <FilterChip
                    key={p.value}
                    active={!!filter.secondaryPositions?.includes(p.value)}
                    onClick={() => togglePos('secondaryPositions', p.value)}
                  >
                    {p.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            {/* Cost range */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">费用区间</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="最低"
                  value={filter.costMin ?? ''}
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      costMin: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="最高"
                  value={filter.costMax ?? ''}
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      costMax: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Picked status */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">选取状态</p>
              <div className="flex flex-wrap gap-1.5">
                {PICKED_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    active={(filter.pickedStatus ?? 'all') === opt.value}
                    onClick={() => setFilter((f) => ({ ...f, pickedStatus: opt.value }))}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Player card list ── */}
      <div className="flex flex-col gap-1.5">
        {visible.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5',
              p.isPicked && 'opacity-50',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">{p.nickname}</span>
                {p.isPicked && (
                  <Badge variant="outline" className="h-auto shrink-0 px-1.5 py-0 text-[10px]">
                    已选
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">@{p.gameId}</span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.primaryPositions.map((pos) => (
                  <PosChip key={`p-${pos}`} pos={pos} filled />
                ))}
                {p.secondaryPositions.map((pos) => (
                  <PosChip key={`s-${pos}`} pos={pos} />
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="text-right leading-tight">
                <div className="text-base font-semibold text-foreground">{p.cost}</div>
                <div className="text-[10px] text-muted-foreground">费用</div>
              </div>
              {renderActions && <div>{renderActions(p)}</div>}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            没有匹配的选手
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。(props 未变 → `DraftControl`/`CaptainDashboard`/`SpectatorView` 的调用处类型不受影响。)

- [ ] **Step 3: 跑测试,确认回归护栏**

Run: `npm run test`
Expected: PASS,`68 passed`。(测试不覆盖 UI;此步确认重写未破坏 import 或类型。)

- [ ] **Step 4: 提交**

```bash
git add src/components/draft/PlayerPool.tsx
git commit -m "refactor(draft): collapsible, localized PlayerPool layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 浏览器冒烟验证

**Files:** 无文件改动 —— 仅在运行中的 dev server 上人工验证。

- [ ] **Step 1: 启动 dev server(若未运行)**

Run: `npm run dev`
Expected: 服务起在 http://localhost:3000。

- [ ] **Step 2: 验证管理员选秀控制台**

打开 `/admin/draft`(管理员登录:`admin` / `lol2026`)。检查左栏选手清单:
- 默认筛选面板只显示搜索框 + 一行「未选 N / M 人 · 筛选 ▾ · 重置」。
- 点「筛选」展开,出现排序 / 主位置 / 副位置 / 费用区间 / 选取状态五组,全中文。
- 勾选位置或填费用后,「筛选」按钮上出现数字徽标;计数与勾选的条件组数一致(搜索、排序不计入)。
- 搜索框输入可过滤;排序四个键生效;「重置」清空所有条件并把展开后的徽标清零。
- 选手卡片单列纵向排列、不溢出窄栏;已选选手半透明并带「已选」标记;位置色块显示中文单字(上/野/中/射/辅)。

Expected: 以上全部成立,无横向溢出、无错位。

- [ ] **Step 3: 验证队长端与观众端**

- 队长端 `/captain`:选手清单同样清爽;每张卡片右下的「选他」按钮(`renderActions`)仍渲染且可点击。
- 观众端 `/live`:选手清单渲染干净;无 `renderActions` 按钮(观众只读)。

Expected: 三处共用的 `PlayerPool` 均渲染正常,行为与重构前一致。

---

## Self-Review 记录

- **Spec 覆盖:** spec §3.1 折叠式筛选区 → Task 1 Step 1(`filtersOpen` + 状态条 + 折叠面板);§3.1 徽标计数规则 → `activeFilterCount`(排除搜索、不计排序);§3.2 单列卡片列表 → Task 1 卡片区(`flex flex-col`,移除 `minmax(280px)`);§4 本地化对照表 → `SORT_OPTIONS`/`PICKED_OPTIONS`/`POS_CHAR`/占位符/「已选」/「费用」标签;§5 验证 → Task 1 Step 2-3 + Task 2。全部有对应。
- **占位符扫描:** 无 TBD/TODO;每个代码步骤含完整代码。
- **类型一致性:** `filtersOpen`/`activeFilterCount`/`togglePos`/`reset`/`FilterChip`/`PosChip` 在文件内定义并使用,命名一致;`PICKED_OPTIONS` 的 `value` 类型 `NonNullable<PlayerFilter['pickedStatus']>` 与 `setFilter` 的 `pickedStatus` 赋值兼容;`POSITION_OPTIONS` 的 `.value`/`.label` 用法与旧版一致。
- **范围:** 单文件,聚焦,无需拆分。
