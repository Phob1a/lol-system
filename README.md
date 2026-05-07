# LoL 选人系统

LoL 战队选秀管理系统：管理员后台 + 队长选秀界面，含 4 轮选秀、4 种排序模式、撤销 / 回退 / 拖拽、按队伍分组导出。

## 技术栈

- Next.js 15（App Router）+ TypeScript + React 18
- PostgreSQL 16 + Prisma 5
- NextAuth v4（Credentials Provider，gameId + 密码）
- Tailwind CSS + shadcn/ui
- Server-Sent Events 实时通道（in-process EventEmitter pub/sub）
- dnd-kit（拖拽位置调整）
- Vitest（83 个单元测试）

## 本地开发

### 前置依赖
- Node.js 22+
- PostgreSQL 16+（macOS：`brew install postgresql@16 && brew services start postgresql@16`）

### 首次启动
```bash
npm install
createdb lol_system
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

打开 http://localhost:3000 。

### 默认账户
- gameId: `admin` · password: `lol2026`（首次登录强制改密；可通过 `.env` 中 `DEFAULT_USER_PASSWORD` 覆盖）

## 开发脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | TS 类型检查 |
| `npm run test` | 单元测试 |
| `npm run db:migrate` | 应用迁移 |
| `npm run db:reset` | 重置 + 重新迁移 + 重新 seed |
| `npm run db:seed` | 仅 seed |
| `npm run db:studio` | Prisma Studio |

### 端到端引擎冒烟
```bash
DATABASE_URL=postgresql://bytedance@localhost:5432/lol_system_test \
  npx prisma db push --skip-generate
DATABASE_URL=postgresql://bytedance@localhost:5432/lol_system_test \
  npx tsx scripts/smoke-draft.ts
```
覆盖：启动 → 4 轮 × 4 模式 → 撤销级联 → 回退 → 拖拽重排 → 跨队拒绝 → 重置。

## 功能完成度

- [x] **Phase 1** — 脚手架（Next.js + Prisma + Tailwind）
- [x] **Phase 2** — 认证 / 选手名册 CRUD / CSV·XLSX 批量导入
- [x] **Phase 3** — 配置管理 / Pre-draft 只读视图 / 筛选·排序
- [x] **Phase 4** — 选秀启动 / 状态机 / SSE 实时通道
- [x] **Phase 5** — 4 种排序模式 / 队长出手 / 管理员代选
- [x] **Phase 6** — 撤销 / 回退 / Reset / 拖拽重排
- [x] **Phase 7-8** — 错误边界 / 404 / 审计日志 / CSV·JSON 导出

## 架构要点

- **状态权威**：Postgres + `DraftEvent` 事件日志 + 物化 `DraftSession`/`Team`/`TeamSlot` 视图
- **撤销 / 回退**：撤销 pick 同轮 ≥I 软撤销 + 后续轮硬删除；回退整轮硬删除；事件日志保留
- **并发控制**：每次 pick 携带 `expectedSeq`，服务端 `SELECT FOR UPDATE` 行锁；STALE_SEQ 返回 409，客户端自动 refetch
- **实时**：Server-Sent Events `/api/draft/stream`；in-process EventEmitter 单实例广播；客户端收到事件后拉取最新 snapshot
- **Mode 4 决策**：BUDGET_DESC 顺序在轮启动时冻结；撤销不重排（用户决策 R1·A）

## 路由总览

### 公开
- `/login` `/change-password` `/access-denied`

### 管理员（role = ADMIN）
- `/admin` 总览
- `/admin/players` 名册（CRUD + 批量导入）
- `/admin/players/import` CSV/XLSX 上传
- `/admin/config` 预算配置
- `/admin/draft` 选秀控制台（启停、轮次配置、撤销、回退、导出）
- `/admin/audit` 事件日志

### 队长（role = CAPTAIN, isCaptain && !isRetired）
- `/captain` 选秀大厅（候选池筛选/排序、当前出手提示、选人弹窗、拖拽位置调整）

### API
- `POST /api/auth/[...nextauth]` `POST /api/auth/change-password`
- `GET/POST /api/players`、`PATCH/DELETE /api/players/:id`、`POST /api/players/import`
- `GET/PATCH /api/config`
- `POST /api/draft/{start,reset}`
- `GET /api/draft/state`、`GET /api/draft/stream`（SSE）
- `POST /api/draft/round/{start,rewind}`
- `POST /api/draft/pick`、`POST /api/draft/pick/:id/revoke`
- `POST /api/draft/team/:id/slots`
- `GET /api/draft/export?format=csv|json`

## 安全注记

- 默认密码（`lol2026`）是统一弱密码；强制首次改密。生产环境建议通过 `.env` 注入随机字符串
- 中间件层 + 服务端 API 双重权限校验（depth-in-defense）
- 选秀启动后名册/配置自动锁定，避免中途篡改
- 审计：所有状态变更（启动、轮次、出手、撤销、回退、重置、调位）写入 `DraftEvent` 表，按 seq 单调递增
