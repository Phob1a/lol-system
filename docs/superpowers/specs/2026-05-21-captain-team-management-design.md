# 队长队伍管理页 — 设计

**状态:** 已批准(brainstorming)
**日期:** 2026-05-21
**作者:** lixuan.dai(与 Claude)
**范围:** 在 captain 端新增一个「队伍管理」页面。选秀结束后,队长可进入该页查看本队阵容,并修改队名与参赛口号。

---

## 1. 背景与目标

captain 端目前只有一个页面 `/captain`(选秀控制台),顶栏无导航。选秀进行中队长用它做 pick。选秀结束后,队长缺少一个查看/管理自己队伍的入口。

**目标:** 选秀结束后,队长能进入「队伍管理」页,查看本队阵容,并修改队名、参赛口号。

**非目标(后续可加,本次不做):** 队伍头像;赛程信息、队伍数据等详情区块;在观众端 / 队伍卡等其它界面同步展示队名或口号。

---

## 2. 已确认决策

| 决策 | 选择 |
|---|---|
| 队伍头像 | 本次不做。`slogan` 用可空字段,后续加 `avatar` 同理,设计上不挡路。 |
| 访问门槛 | 仅选秀结束后(`Season.status === 'COMPLETED'`)可访问该页。未结束则重定向回 `/captain`。 |
| 详情区内容 | 仅「队伍阵容」。预算概览、选秀记录、账号信息不做。赛程 / 队伍数据为后续区块。 |
| 页面形态 | 方案 A —— 顶部「队伍信息」表单卡(队名 + 口号 + 一个保存按钮)+ 下方「队伍阵容」区。 |
| 可编辑字段 | 队名、参赛口号。 |

---

## 3. 数据模型

`Team` 模型新增一个字段:

```prisma
model Team {
  // ... 现有字段不变
  slogan String?   // 参赛口号,选填、可空
}
```

`name` 已存在,不改。无生产数据,schema 变更直接重建(沿用本项目既定做法)。

---

## 4. 架构与组件

| 单元 | 位置 | 职责 |
|---|---|---|
| 队伍管理页 | `src/app/captain/team/page.tsx` | 服务端组件。校验赛季为 `COMPLETED`,否则 `redirect('/captain')`。查当前队长的队伍 + 阵容,渲染 `TeamManager`。 |
| `TeamManager` | `src/components/captain/TeamManager.tsx` | 客户端组件。「队伍信息」表单卡(队名/口号输入 + 保存)+「队伍阵容」只读区。 |
| 更新接口 | `src/app/api/captain/team/route.ts` | `PATCH` —— 队长更新自己队伍的队名/口号。 |
| Zod schema | `src/lib/teams/team-schema.ts`(新建) | `UpdateTeamProfileInput`。 |
| service | `src/lib/teams/team-service.ts`(扩展) | 新增 `updateTeamProfile`。 |
| captain 布局 | `src/app/captain/layout.tsx`(改) | 顶栏新增导航:「选秀台」常驻 +「队伍管理」仅赛季 `COMPLETED` 时显示。 |

### 4.1 队伍管理页 `captain/team/page.tsx`

- `getSession()` 取 `session.user.teamId`(captain 布局已保证角色为 CAPTAIN)。
- `getActiveSeason(prisma)` —— 若无赛季或 `status !== 'COMPLETED'`,`redirect('/captain')`。
- 查队伍:`prisma.team.findUnique({ where: { id: teamId }, include: { slots: { include: { registration: { include: { player: true } } } } } })`。若查不到队伍(异常情况),渲染友好提示「未找到你的队伍」。
- 把队伍数据(`name`、`slogan`、按位置排序的阵容行)传给 `TeamManager`。每行的「是否队长」直接取 `slot.registration.isCaptain`(`Registration` 自带该字段),无需额外查 `captain` 关系。

### 4.2 `TeamManager` 组件

Props:`teamId`、`name`、`slogan`、`roster`(每行:`position`、`nickname`、`gameId`、`cost`、`isCaptain`)。

- **队伍信息卡:** 队名输入框(必填)、参赛口号输入框(选填,提示「最多 50 字」)、「保存」按钮。本地 state 持有两字段;点保存 → `PATCH /api/captain/team`;成功 `toast` + `router.refresh()`,失败 `toast` 错误。表单脏值判断:与初始值相同时「保存」禁用。
- **队伍阵容区:** 按 上/野/中/射/辅 顺序渲染 5 行,每行位置色块 + 昵称 + `@gameId` + 费用;`isCaptain` 行带「队长」标记。`registration` 为空的位置显示「空缺」。

### 4.3 更新接口 `PATCH /api/captain/team`

- `requireCaptain()` —— 未登录 401、非队长 403。
- 请求体经 `UpdateTeamProfileInput` 校验,失败 400。
- 复核 `getActiveSeason`:`status !== 'COMPLETED'` → 409(防止绕过页面门槛直接调用)。
- 用 `session.user.teamId` 作为目标队伍 id —— 队长只能改自己的队,不接受请求体里传入的 teamId。
- 调 `updateTeamProfile(prisma, teamId, { name, slogan })`,返回更新后的队伍。

### 4.4 service `updateTeamProfile`

```ts
export async function updateTeamProfile(
  db: PrismaClient,
  teamId: string,
  input: { name: string; slogan: string | null },
): Promise<void>
```

`db.team.update({ where: { id: teamId }, data: { name, slogan } })`。现有 `renameTeam` 保留(admin 的 `TeamsManager` 仍在用),不动。

### 4.5 Zod schema

```ts
export const UpdateTeamProfileInput = z.object({
  name: z.string().trim().min(1, '队名必填').max(20, '队名过长'),
  slogan: z.string().trim().max(50, '口号过长').optional().transform((v) => v || null),
});
```

`slogan` 空字符串归一为 `null`。

### 4.6 captain 布局导航

`captain/layout.tsx` 现为极简顶栏。改造:在品牌名右侧加导航链接。「选秀台」(`/captain`)常驻;「队伍管理」(`/captain/team`)仅当 `getActiveSeason` 返回的赛季 `status === 'COMPLETED'` 时渲染 —— 选秀未结束时不显示该入口(链接出现即可点进、不出现就没有死链)。当前激活项高亮。

---

## 5. 错误处理

| 情况 | 处理 |
|---|---|
| 选秀未结束访问 `/captain/team` | 页面 `redirect('/captain')` |
| 队长无队伍(异常) | 页面渲染「未找到你的队伍」提示 |
| API 未登录 / 非队长 | 401 / 403(`requireCaptain`) |
| API 请求体校验失败 | 400,返回首条错误信息 |
| API 赛季未 COMPLETED | 409 |
| 保存成功 / 失败 | 前端 `toast` 成功 / 错误提示 |

---

## 6. 测试与验证

- `updateTeamProfile` 加 service 单元测试(更新队名 + 口号;口号传 `null`)。
- `UpdateTeamProfileInput` 可加 schema 测试(队名空 / 超长、口号超长、空串归一为 null)。
- 页面与 `TeamManager` 组件属 UI,不写新单元测试 —— 靠 `npm run typecheck` 零错误 + 既有测试套件维持全绿(回归护栏)+ 浏览器冒烟验证。
- 浏览器冒烟:选秀未结束时 `/captain/team` 重定向、顶栏无「队伍管理」入口;选秀 `COMPLETED` 后入口出现、页面展示阵容、改队名/口号并保存成功、刷新后保留。

---

## 7. 范围外 / 后续

- 队伍头像(`Team.avatar`)。
- 详情区的赛程信息、队伍数据等区块。
- 队名 / 口号在观众端、队伍卡等其它界面的展示。
- 队长对阵容本身的任何修改(阵容只读)。
