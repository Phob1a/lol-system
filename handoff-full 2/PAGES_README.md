# Tactical · 并行页面落地包

所有文件都是 `*.tactical.tsx` / `*.tactical` 后缀，**不会覆盖原文件**。
切换方式：在 import 路径上加 `.tactical` 即可。

```
handoff-full/
├── styles/tactical.css                                     # 阶段 1
├── components/
│   ├── tactical/                                            # 阶段 2 原子组件
│   ├── captain/CaptainNotificationDialog.tsx                # 弹窗（已替换）
│   ├── auth/LoginForm.tactical.tsx                          # NEW
│   ├── admin/ConfigForm.tactical.tsx                        # NEW
│   ├── admin/DraftControl.tactical.tsx                      # NEW
│   ├── players/PlayerManager.tactical.tsx                   # NEW
│   └── layout/AdminNav.tactical.tsx                         # NEW
└── app/
    ├── login/page.tactical.tsx                              # NEW
    └── admin/
        ├── page.tactical.tsx                                # NEW (overview)
        ├── config/page.tactical.tsx                         # NEW
        ├── draft/page.tactical.tsx                          # NEW
        ├── players/page.tactical.tsx                        # NEW
        └── audit/page.tactical.tsx                          # NEW
```

## 切换方法（让 Claude Code 做）

每个 server page 文件已 `import { X } from '@/.../X.tactical'`，
要把站点切到 Tactical 风：

1. 把 Next 路由文件改成用 `.tactical`：例如
   `cp src/app/admin/config/page.tactical.tsx src/app/admin/config/page.tsx`
   （或在原 `page.tsx` 里改 `import { ConfigForm } from '@/components/admin/ConfigForm.tactical'`）

2. 同样替换 layout 里的 `AdminNav` 引用为 `AdminNav.tactical`。

回退：删除 `*.tactical.tsx` / 还原 import 即可。

## 业务逻辑保留

- `LoginForm` ⇒ `signIn('credentials', { gameId, password })` 不变
- `ConfigForm` ⇒ `PUT /api/config` body 不变
- `DraftControl` ⇒ `EventSource('/api/draft/stream')` + `POST /api/draft/{start,round/next,reset}`
- `PlayerManager` ⇒ `DELETE /api/players/[id]` 不变
- `Audit` ⇒ 直接读 `prisma.draftEvent` 与原版同源
- `CaptainNotificationDialog` ⇒ props 完全一致（`kind/currentRound/budgetLeft/emptySlots/onConfirm`）

## v2 追加（已补）

- `components/players/PlayerFormDialog.tactical.tsx` — props 与原版完全一致（mode/player/open/onOpenChange/onSaved）。zod + react-hook-form + POST/PATCH /api/players[/id] 不变。
- `components/players/ImportUpload.tactical.tsx` + `app/admin/players/import/page.tactical.tsx` — POST /api/players/import body/返回完全一致。
- `components/auth/ChangePasswordForm.tactical.tsx` + `app/change-password/page.tactical.tsx` — POST /api/auth/change-password 不变；新增了密码强度提示（纯前端，无后端依赖）。

## 切换备忘

- `PlayerManager.tactical` 的 EDIT 按钮目前是占位 — 切到 Tactical 时记得把 PlayerFormDialog 的导入也指向 `.tactical` 版（或在原 PlayerManager 里挂 `.tactical` 的 Dialog）。
- `DraftControl.tactical` 中 `snap.teams[].onClock / .filled / .budgetLeft` 按 getDraftSnapshot() 实际字段对一下；不一致只改取值即可。
