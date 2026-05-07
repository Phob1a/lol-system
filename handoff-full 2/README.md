# Tactical · 阶段 1 + 2 + 弹窗 落地包

完整目录结构（直接合并到你的 lol-system 项目）：

```
handoff-full/
├── styles/
│   └── tactical.css                       # 阶段 1：tokens + 工具类 + 动画
├── components/
│   ├── tactical/                          # 阶段 2：原子组件库
│   │   ├── HudTimer.tsx                   #   圆环倒计时（支持 deadline 同步）
│   │   ├── TcPos.tsx                      #   T/J/M/A/S 位置标
│   │   ├── TcBar.tsx                      #   进度条
│   │   ├── TcCard.tsx                     #   带 4 角括号的卡片
│   │   ├── TcPlayerRow.tsx                #   候选选手行
│   │   └── index.ts                       #   re-exports
│   └── captain/
│       └── CaptainNotificationDialog.tsx  # 弹窗模块（替换原文件）
└── README.md
```

## 安装步骤

### 1. 拷贝 CSS

```bash
cp handoff-full/styles/tactical.css lol-system/src/styles/tactical.css
```

在 `lol-system/src/app/layout.tsx` 顶部加：
```tsx
import '@/styles/tactical.css';
```

### 2. 拷贝原子组件

```bash
mkdir -p lol-system/src/components/tactical
cp handoff-full/components/tactical/*.tsx lol-system/src/components/tactical/
cp handoff-full/components/tactical/index.ts lol-system/src/components/tactical/
```

使用：
```tsx
import { HudTimer, TcPos, TcCard, TcBar, TcPlayerRow } from '@/components/tactical';
```

### 3. 替换弹窗

```bash
cp handoff-full/components/captain/CaptainNotificationDialog.tsx \
   lol-system/src/components/captain/CaptainNotificationDialog.tsx
```

API 不变，调用方零改动。

## 关键设计

| 组件 | 关键 prop | 备注 |
|---|---|---|
| `HudTimer` | `deadline` (ms) | 用服务端时间戳避免漂移；fallback `value` |
| `TcPos` | `on` / `dim` | 高亮已选 / 灰显未选 |
| `TcBar` | `animated` | 流动条纹用于"自家正在花钱"的视觉提示 |
| `TcCard` | `tab` / `corners` | 标贴 + 4 角括号是 Tactical 的招牌细节 |
| `TcPlayerRow` | `on` / `picked` / `hot` | 三态：选中 / 已被选 / 热门推荐 |

## 字体

`tactical.css` 顶部已 `@import` Chakra Petch + Rajdhani + JetBrains Mono。
**生产建议**：改用 `next/font/google` 在 `app/layout.tsx` 加载，把 `@import` 那行删掉，CSS 变量改为引用 `next/font` 暴露的 `--font-*` 变量。

## 落地后下一步

阶段 3（实时机制）的核心是：
1. SSE endpoint `/api/draft/stream` → 客户端 zustand store
2. `HudTimer deadline={pickStartedAt + 45000}` 服务端权威
3. `POST /api/draft/pick` 带 `expectedSeq`，409 时 reconcile

阶段 4（页面落地）按 Login → Captain → Admin OPS → Broadcast → Roster → Config → Audit 顺序。
