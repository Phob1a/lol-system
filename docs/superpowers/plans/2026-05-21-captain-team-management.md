# 队长队伍管理页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 captain 端新增「队伍管理」页 —— 选秀结束后队长可查看本队阵容,并修改队名与参赛口号。

**Architecture:** `Team` 模型新增可空字段 `slogan`。新增一个 captain 专属页面 `/captain/team`(仅赛季 `COMPLETED` 时可访问,且校验队伍属于当前赛季),由服务端组件查队伍 + 阵容、客户端组件 `TeamManager` 渲染表单与阵容。修改经 `PATCH /api/captain/team` → service `updateTeamProfile`。captain 顶栏新增导航(`CaptainNav`),「队伍管理」入口仅赛季结束后出现。

**Tech Stack:** Next.js 15(App Router)/ React 18 / TypeScript / Prisma 5 + PostgreSQL / NextAuth v4 / Zod / shadcn-ui(`Card`/`Input`/`Button`/`Badge`)/ sonner / vitest。

设计依据:`docs/superpowers/specs/2026-05-21-captain-team-management-design.md`。

---

## 背景:实现者需要知道的事

- **Team 与赛季关系:** `Team` 有 `seasonId`、`name`、`captainId`(→`Registration`)、`userId`(→`User` 登录账号)、`budgetLeft`。每赛季每队一条。队伍账号 `User` 每赛季新建,`role = 'CAPTAIN'`。
- **阵容数据:** 选秀开始时引擎为每队创建 5 条 `TeamSlot`(位置 `TOP/JUNGLE/MID/ADC/SUPPORT`),并把队长放进其主位对应的 slot;其余 slot 由 draft pick 填充。选秀 `COMPLETED` 后 5 个 slot 均已填满。每个 `TeamSlot` 有 `position` 和可空的 `registration`。
- **队长判定:** 一支队的 slots 里,`registration.isCaptain === true` 的那条就是本队队长(队长不会进入选秀池、不会被别队选走,所以一支队的 slots 里恰有一条 isCaptain)。
- **鉴权:** `requireCaptain()`(`src/lib/api-guards.ts`)返回 `{ error: NextResponse }` 或 `{ session }`;它保证 `session.user.role === 'CAPTAIN'` 且 `session.user.teamId` 存在。`getSession()`(`src/lib/auth`)返回会话,`session.user` 有 `role`、`teamId`、`username`。
- **赛季:** `getActiveSeason(prisma)`(`src/lib/season/season-service.ts`)返回唯一非归档赛季或 `null`;`Season.status` 枚举含 `COMPLETED`。
- **测试库:** `vitest.setup.ts` 在整套测试前对 `TEST_DATABASE_URL` 跑 `prisma db push`,因此 schema 加字段后测试库会自动同步,无需手动迁移测试库。当前测试总数 **68**。
- **不写新 UI 单元测试:** 项目测试只覆盖 service / 纯函数,不覆盖 React 组件(spec §6)。页面与组件靠 typecheck + 既有测试回归 + 浏览器冒烟验证。

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `prisma/schema.prisma` | 改 | `Team` 模型加 `slogan String?` |
| `src/lib/teams/team-schema.ts` | 新建 | `UpdateTeamProfileInput` Zod schema |
| `src/lib/teams/team-schema.test.ts` | 新建 | schema 单元测试 |
| `src/lib/teams/team-service.ts` | 改 | 新增 `updateTeamProfile` |
| `src/lib/teams/team-service.test.ts` | 改 | `updateTeamProfile` 单元测试 |
| `src/app/api/captain/team/route.ts` | 新建 | `PATCH` 更新队名/口号 |
| `src/components/captain/TeamManager.tsx` | 新建 | 队伍信息表单卡 + 阵容区(客户端组件) |
| `src/components/layout/CaptainNav.tsx` | 新建 | captain 顶栏导航(客户端组件) |
| `src/app/captain/team/page.tsx` | 新建 | 队伍管理页(服务端组件,门槛校验 + 查数据) |
| `src/app/captain/layout.tsx` | 改 | 顶栏接入 `CaptainNav` |

---

## Task 1: Team 模型新增 slogan 字段

**Files:**
- Modify: `prisma/schema.prisma`(`model Team`)

- [ ] **Step 1: 给 `model Team` 添加 `slogan` 字段**

在 `prisma/schema.prisma` 的 `model Team` 中,`budgetLeft Float  @default(0)` 这一行之后、空行之前,加一行:

```prisma
  slogan     String?
```

加完后 `model Team` 的标量字段段落应为:

```prisma
model Team {
  id         String @id @default(cuid())
  seasonId   String
  name       String
  captainId  String @unique
  userId     String @unique
  budgetLeft Float  @default(0)
  slogan     String?
```

(其余 relation 字段、`createdAt`、`@@index`、`@@map` 不动。)

- [ ] **Step 2: 生成并应用迁移**

Run: `npx prisma migrate dev --name add_team_slogan`
Expected: 新建迁移目录 `prisma/migrations/<timestamp>_add_team_slogan/`,迁移应用成功,Prisma Client 重新生成。`slogan` 是可空列,纯追加,不会触发数据丢失提示。

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。

- [ ] **Step 4: 提交**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(team): add nullable slogan field to Team

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Zod schema 与 service `updateTeamProfile`

**Files:**
- Create: `src/lib/teams/team-schema.ts`
- Create: `src/lib/teams/team-schema.test.ts`
- Modify: `src/lib/teams/team-service.ts`
- Modify: `src/lib/teams/team-service.test.ts`

- [ ] **Step 1: 创建 `src/lib/teams/team-schema.ts`**

```ts
import { z } from 'zod';

/** Captain-editable team profile fields. */
export const UpdateTeamProfileInput = z.object({
  name: z.string().trim().min(1, '队名必填').max(20, '队名过长'),
  slogan: z
    .string()
    .trim()
    .max(50, '口号过长')
    .optional()
    .transform((v) => v || null),
});
export type UpdateTeamProfileInput = z.infer<typeof UpdateTeamProfileInput>;
```

`UpdateTeamProfileInput` 解析后类型为 `{ name: string; slogan: string | null }` —— 缺省或空串的 `slogan` 归一为 `null`。

- [ ] **Step 2: 创建 schema 测试 `src/lib/teams/team-schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { UpdateTeamProfileInput } from './team-schema';

describe('UpdateTeamProfileInput', () => {
  it('accepts a valid name and slogan', () => {
    const r = UpdateTeamProfileInput.parse({ name: '疾风战队', slogan: '永不言败' });
    expect(r).toEqual({ name: '疾风战队', slogan: '永不言败' });
  });

  it('normalizes an empty slogan to null', () => {
    expect(UpdateTeamProfileInput.parse({ name: '队名', slogan: '   ' }).slogan).toBeNull();
  });

  it('normalizes a missing slogan to null', () => {
    expect(UpdateTeamProfileInput.parse({ name: '队名' }).slogan).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(UpdateTeamProfileInput.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name longer than 20 chars', () => {
    expect(UpdateTeamProfileInput.safeParse({ name: 'x'.repeat(21) }).success).toBe(false);
  });

  it('rejects a slogan longer than 50 chars', () => {
    expect(
      UpdateTeamProfileInput.safeParse({ name: '队名', slogan: 'x'.repeat(51) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: 运行 schema 测试,确认通过**

Run: `npm run test -- src/lib/teams/team-schema.test.ts`
Expected: PASS,6 个测试全绿。(schema 在 Step 1 已建,故此步即通过。)

- [ ] **Step 4: 在 `src/lib/teams/team-service.ts` 末尾追加 `updateTeamProfile`**

在文件末尾(现有 `renameTeam` 函数之后)追加:

```ts
/** Update a team's captain-editable profile (name + slogan). Authorization is enforced by the route. */
export async function updateTeamProfile(
  db: PrismaClient,
  teamId: string,
  input: { name: string; slogan: string | null },
): Promise<void> {
  await db.team.update({
    where: { id: teamId },
    data: { name: input.name, slogan: input.slogan },
  });
}
```

(现有 `renameTeam` 保留不动 —— admin 的 `TeamsManager` 仍在用。`PrismaClient` 已在文件顶部从 `@prisma/client` 导入。)

- [ ] **Step 5: 在 `src/lib/teams/team-service.test.ts` 增加测试**

把首行 import 改为同时引入 `updateTeamProfile`:

```ts
import { listSeasonTeams, resetTeamPassword, updateTeamProfile } from './team-service';
```

在 `describe('team-service', () => {` 块内、最后一个 `it(...)` 之后、`});` 之前追加两个测试:

```ts
  it('updateTeamProfile updates name and slogan', async () => {
    const { teamId } = await appointed();
    await updateTeamProfile(testDb, teamId, { name: '新队名', slogan: '新口号' });
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.name).toBe('新队名');
    expect(team.slogan).toBe('新口号');
  });

  it('updateTeamProfile accepts a null slogan', async () => {
    const { teamId } = await appointed();
    await updateTeamProfile(testDb, teamId, { name: '队名', slogan: null });
    const team = await testDb.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.slogan).toBeNull();
  });
```

(`appointed()` 辅助函数已在该测试文件顶部定义,创建赛季→报名→任命队长→得到 `teamId`。)

- [ ] **Step 6: 运行完整测试套件**

Run: `npm run test`
Expected: PASS。新增 8 个测试(team-schema 6 + team-service 2),总数 68 → **76**。

- [ ] **Step 7: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。

- [ ] **Step 8: 提交**

```bash
git add src/lib/teams/team-schema.ts src/lib/teams/team-schema.test.ts src/lib/teams/team-service.ts src/lib/teams/team-service.test.ts
git commit -m "feat(team): updateTeamProfile service + UpdateTeamProfileInput schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: PATCH /api/captain/team 接口

**Files:**
- Create: `src/app/api/captain/team/route.ts`

- [ ] **Step 1: 创建 `src/app/api/captain/team/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requireCaptain } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { UpdateTeamProfileInput } from '@/lib/teams/team-schema';
import { updateTeamProfile } from '@/lib/teams/team-service';

export async function PATCH(req: Request) {
  const guard = await requireCaptain();
  if (guard.error) return guard.error;

  const teamId = guard.session.user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: '需要队长账号' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateTeamProfileInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  const season = await getActiveSeason(prisma);
  if (!season || season.status !== 'COMPLETED') {
    return NextResponse.json({ error: '选秀尚未结束' }, { status: 409 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.seasonId !== season.id) {
    return NextResponse.json({ error: '无权操作该队伍' }, { status: 403 });
  }

  try {
    await updateTeamProfile(prisma, teamId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/captain/team failed', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/captain/team/route.ts
git commit -m "feat(api): PATCH /api/captain/team to update team profile

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: TeamManager 与 CaptainNav 组件

**Files:**
- Create: `src/components/captain/TeamManager.tsx`
- Create: `src/components/layout/CaptainNav.tsx`

两个都是叶子组件,本任务只创建、暂不被引用(Task 5 接入)。未被引用的合法组件不影响编译。

- [ ] **Step 1: 创建 `src/components/captain/TeamManager.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export type RosterRow = {
  position: string;
  nickname: string | null;
  gameId: string | null;
  cost: number | null;
  isCaptain: boolean;
};

type Props = {
  name: string;
  slogan: string | null;
  roster: RosterRow[];
};

/** Chinese single-character marker for a position value. */
const POS_CHAR: Record<string, string> = {
  TOP: '上',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUPPORT: '辅',
};

export function TeamManager({ name, slogan, roster }: Props) {
  const router = useRouter();
  const [nameVal, setNameVal] = useState(name);
  const [sloganVal, setSloganVal] = useState(slogan ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = nameVal !== name || sloganVal !== (slogan ?? '');

  async function handleSave() {
    if (nameVal.trim() === '') {
      toast.error('队名必填');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/captain/team', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameVal, slogan: sloganVal }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
      toast.success('队伍信息已保存');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '保存失败');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">队伍管理</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">队伍信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">队名</label>
            <Input
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">参赛口号</label>
            <Input
              value={sloganVal}
              onChange={(e) => setSloganVal(e.target.value)}
              maxLength={50}
              placeholder="选填 · 最多 50 字"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">队伍阵容</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {roster.map((row) => (
            <div key={row.position} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
                {POS_CHAR[row.position] ?? row.position}
              </span>
              {row.nickname ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {row.nickname}
                      </span>
                      {row.isCaptain && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          队长
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">@{row.gameId}</span>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-sm font-semibold text-foreground">{row.cost}</div>
                    <div className="text-[10px] text-muted-foreground">费用</div>
                  </div>
                </>
              ) : (
                <span className="flex-1 text-sm text-muted-foreground">空缺</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/components/layout/CaptainNav.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Props = { showTeamManagement: boolean };

export function CaptainNav({ showTeamManagement }: Props) {
  const pathname = usePathname();
  const links = [
    { href: '/captain', label: '选秀台' },
    ...(showTeamManagement ? [{ href: '/captain/team', label: '队伍管理' }] : []),
  ];
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active =
          l.href === '/captain' ? pathname === '/captain' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。

- [ ] **Step 4: 提交**

```bash
git add src/components/captain/TeamManager.tsx src/components/layout/CaptainNav.tsx
git commit -m "feat(captain): TeamManager and CaptainNav components

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 队伍管理页 + captain 布局接入导航

**Files:**
- Create: `src/app/captain/team/page.tsx`
- Modify: `src/app/captain/layout.tsx`

- [ ] **Step 1: 创建 `src/app/captain/team/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { TeamManager, type RosterRow } from '@/components/captain/TeamManager';

export const dynamic = 'force-dynamic';

// Roster display order, top to bottom.
const POSITION_ORDER: Record<string, number> = {
  TOP: 0,
  JUNGLE: 1,
  MID: 2,
  ADC: 3,
  SUPPORT: 4,
};

export default async function CaptainTeamPage() {
  const session = await getSession();
  const teamId = session?.user.teamId;
  if (!teamId) redirect('/captain');

  const season = await getActiveSeason(prisma);
  if (!season || season.status !== 'COMPLETED') redirect('/captain');

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      slots: { include: { registration: { include: { player: true } } } },
    },
  });
  if (!team) {
    return <div className="text-muted-foreground">未找到你的队伍</div>;
  }
  // Reject past-season captain accounts.
  if (team.seasonId !== season.id) redirect('/captain');

  const roster: RosterRow[] = [...team.slots]
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99))
    .map((slot) => ({
      position: slot.position,
      nickname: slot.registration?.nickname ?? null,
      gameId: slot.registration?.player.gameId ?? null,
      cost: slot.registration?.cost ?? null,
      isCaptain: slot.registration?.isCaptain ?? false,
    }));

  return <TeamManager name={team.name} slogan={team.slogan} roster={roster} />;
}
```

- [ ] **Step 2: 用以下完整内容替换 `src/app/captain/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { CaptainNav } from '@/components/layout/CaptainNav';

export default async function CaptainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role !== 'CAPTAIN') {
    redirect('/access-denied');
  }

  const season = await getActiveSeason(prisma);
  const showTeamManagement = season?.status === 'COMPLETED';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-4 border-b px-6">
        <span className="text-sm font-semibold text-foreground">LoL 选人系统</span>
        <CaptainNav showTeamManagement={showTeamManagement} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{session.user.username}</span>
          <a href="/api/auth/signout" className="text-muted-foreground hover:text-foreground">登出</a>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

(相对原文件:新增 `prisma`/`getActiveSeason`/`CaptainNav` 三个 import;`header` 加 `gap-4`、插入 `<CaptainNav>`、用户区改为 `ml-auto`。auth 守卫逻辑不变。)

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: PASS,零错误。

- [ ] **Step 4: 跑测试,确认回归护栏**

Run: `npm run test`
Expected: PASS,76 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add src/app/captain/team/page.tsx src/app/captain/layout.tsx
git commit -m "feat(captain): team management page + captain nav

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 浏览器冒烟验证

**Files:** 无文件改动 —— 仅在运行中的 dev server 上人工验证。

- [ ] **Step 1: 启动 dev server(若未运行)**

Run: `npm run dev`
Expected: 服务起在 http://localhost:3000。

- [ ] **Step 2: 验证选秀未结束时的门槛**

当前活跃赛季状态非 `COMPLETED` 时,用队伍账号登录:
- captain 顶栏只有「选秀台」,没有「队伍管理」入口。
- 直接访问 `/captain/team` → 重定向回 `/captain`。

Expected: 以上成立。

- [ ] **Step 3: 验证选秀结束后的队伍管理页**

赛季 `COMPLETED` 后,用队伍账号登录:
- 顶栏出现「队伍管理」入口,点进 `/captain/team`。
- 「队伍信息」卡显示当前队名、口号;「队伍阵容」按 上/野/中/射/辅 显示 5 行,每行昵称 / `@游戏ID` / 费用,队长行带「队长」标记。
- 改队名、改口号 → 点「保存」→ toast 成功;刷新页面后改动保留。
- 队名清空后保存 → toast 报错(队名必填)。

Expected: 以上全部成立。

---

## Self-Review 记录

- **Spec 覆盖:** spec §3 数据模型 → Task 1;§4.4 service / §4.5 schema → Task 2;§4.3 API(含赛季 COMPLETED 复核、`team.seasonId === activeSeason.id` 复核)→ Task 3;§4.2 `TeamManager` / §4.6 captain 导航组件 → Task 4;§4.1 页面(门槛 + 当前赛季校验 + 阵容查询)/ §4.6 布局接入 → Task 5;§6 验证 → Task 2 Step 6-7、Task 5 Step 3-4、Task 6。全部有对应。
- **占位符扫描:** 无 TBD/TODO;每个代码步骤含完整代码。
- **类型一致性:** `RosterRow` 在 `TeamManager.tsx` 定义并 export,Task 5 页面 import 同名类型;`UpdateTeamProfileInput` 解析输出 `{ name: string; slogan: string | null }` 与 `updateTeamProfile` 第三参 `{ name: string; slogan: string | null }` 一致;`CaptainNav` 的 `showTeamManagement: boolean` 与 layout 传入的 `season?.status === 'COMPLETED'`(boolean)一致。
- **范围说明:** spec §4.2 曾把 `teamId` 列为 `TeamManager` 的 prop,但 `PATCH /api/captain/team` 从会话推导队伍 id、组件无需传 teamId,故实现中 `TeamManager` 不含 `teamId` prop —— 这是对 spec 的合理精简,不影响任何行为。
- **范围:** 单一功能,6 个任务,无需拆分为多个 plan。
