# 赛季-赛事整合设计（逻辑合一）

日期：2026-06-12 ｜ 状态：rev.1 待审 ｜ 前置：tournament v2 M1（已上线，53126f6）

## 1. 目标与决策记录

| 决策点 | 结论 |
|---|---|
| 整合方式 | **逻辑合一**：存储保留 Season / Tournament 两表，体验上单一实体——创建赛季同事务自动创建赛事（用户选定，物理单表合并被否：状态机本质独立、M1 大返工、锁死一季多赛事扩展） |
| 赛事预设 | **必填**：新建赛季必须带赛事 kind + config（用户选定） |
| 1:1 保证 | 新赛季从创建起 1:1；删赛季级联删赛事（FK 已 Cascade）。赛事不再可单独删除，改为"重置" |
| 后续可修改 | SETUP 期可改全部配置（重新生成骨架）；开打后仅 name/kind 标签 |
| 老数据兼容 | 已有无赛事的赛季（如大王杯S-1）保留"手动创建赛事"入口作为 fallback |

## 2. 核心变化：赛事创建拆为"骨架先行 + 分组时绑队"

现状 `createTournament` 一次完成：校验 config → 校验 teamIds → 建 Tournament + 参赛队快照 + 阶段/分组占位 + 淘汰赛空位对阵 + 晋级边。

矛盾：建赛季时队伍尚不存在（报名→选秀→组队之后才有）。

拆分（关键洞察：骨架本来就不需要队伍——淘汰赛对阵是空位，分组是占位）：

1. **`createTournamentShell(db, { seasonId, name, kind, config, actorUserId })`**
   建 Tournament(SETUP) + 阶段 + 分组占位 + 淘汰赛空位对阵 + 晋级边。**不建** TournamentTeam 快照。即现 createTournament 去掉 teams 校验与快照部分。
2. **`assignGroups` 增强（替代独立"绑队"步骤）**
   SETUP 状态下保存分组时，同事务**重建参赛队快照**：assignments 覆盖的全部 teamId 即参赛队集合（校验 ∈ season、数量 = groupCount×teamsPerGroup、覆盖全部分组、无重复——后四项 M1 已有）。快照 players 仍取当前 TeamSlot。重复保存 = 删旧快照重建（SETUP 期安全，无比分依赖）。
   `confirmGroups` 及之后流程完全不变。
3. **`createTournament`（M1 原函数）退役**，由 shell + assignGroups 组合覆盖。fallback 入口（老赛季）走 shell，与新赛季后续流程一致。

步骤对比：

| | M1 现状 | 本设计 |
|---|---|---|
| 建赛季 | 只建 Season | Season + 赛事骨架（一个表单、一个事务） |
| 组队完成后 | 建赛事（选队+配置）→ 分组 → 确认 | 分组（隐含圈定参赛队）→ 确认 |

## 3. 服务层 API

### 3.1 `createSeason` 扩展（season-service）

```
CreateSeasonInput += {
  tournament: {
    name?: string;        // 缺省 = 赛季名
    kind: string;         // 正赛/娱乐赛/海斗/自定义文本
    config: GroupKnockoutConfig;
  }
}
```

事务顺序：archiveActiveSeason → season.create → createTournamentShell。config 非法（groupKnockout.validate 抛错）→ 整体回滚，赛季不会半建。

### 3.2 新增 tournament-service 函数

```
createTournamentShell(db, { seasonId, name, kind, config, actorUserId })   // §2
updateTournamentConfig(db, { tournamentId, name?, kind?, config?, actorUserId })
resetTournament(db, { tournamentId, actorUserId })
```

- `updateTournamentConfig`：
  - `name`/`kind`：status ≠ FINISHED 时可改。
  - `config`：仅 status = SETUP。实现 = 校验新 config → 同事务删除 stages/groups/matches/edges + TournamentGroupTeam + TournamentTeam 快照 → 按新 config 重建骨架。UI 须提示"已保存的分组将清空"。
  - 审计：`tournament.config.update`。
- `resetTournament`：任意状态 → 清空全部 stages/groups/matches/edges/快照（Game 级联）→ 按当前 config 重建骨架 → status 回 SETUP。审计 `tournament.reset`。替代原"删除赛事"危险区（两步确认保留：confirm + 输入赛事名）。
- `deleteTournament` 与 `DELETE /api/tournament/admin` 路由**移除**（单一实体语义下"赛季无赛事"不再是新数据的合法状态；老赛季 fallback 只创建不删除）。

## 4. HTTP 路由

| 路由 | 变化 |
|---|---|
| `POST /api/seasons` | body 增加必填 `tournament: { name?, kind, config }`（Zod：config passthrough，service 内 validate） |
| `POST /api/tournament/admin` | 改为调 createTournamentShell（body 去掉 teamIds）；仅当赛季尚无赛事（老赛季 fallback） |
| `DELETE /api/tournament/admin` | 移除 |
| `PATCH /api/tournament/admin` | 新增 → updateTournamentConfig |
| `POST /api/tournament/admin/reset` | 新增 → resetTournament |
| 其余（groups/close-groups/matches/*、public/*） | 不变（assignGroups 行为增强对路由透明） |

## 5. UI

- **SeasonManager（建赛季表单）**：新增"赛事设置"区块——赛事名（默认跟随赛季名）、类别 Select（正赛/娱乐赛/海斗/自定义→文本）、组数/每组队数/每组出线、小组 BO、各轮 BO（按出线总数动态渲染）。校验逻辑与 M1 SetupTab 相同 → **把 SetupTab 的配置表单抽成共用组件 `TournamentConfigForm`**（SeasonManager 与 SetupTab 共用）。
- **SetupTab**：
  - 有赛事：配置摘要 + SETUP 时"修改配置"（复用 TournamentConfigForm，提交 PATCH）+ 非 SETUP 时仅 name/kind 可改；危险区由"删除赛事"改为"重置赛事"。
  - 无赛事（老赛季）：保留创建表单（提交到改造后的 POST，不再选参赛队）。
- **GroupsTab**：SETUP 时每组 Select 选项来自**全赛季队伍**（page.tsx 已传入 teamList），保存分组即圈定参赛队；其余不变。

## 6. 数据库

**零 schema 变更、零迁移。** 全部为服务层/路由/UI 行为变化。

## 7. 测试

- season-service：建赛季原子性（赛事骨架同建；config 非法整体回滚；归档旧赛季仍生效）
- tournament-service：shell 骨架完整性（沿用 M1 断言去掉快照部分）；updateTournamentConfig 的 SETUP/非 SETUP 矩阵 + 骨架重建正确性；resetTournament 清空回 SETUP
- groups-service：assignGroups 重建快照（含重复保存覆盖）、季外队伍拒绝、数量不符拒绝
- 集成：建赛季(带配置) → 分组 → 确认 → 录分 → 冠军 全链路（替换原 integration.test.ts 的 createTournament 入口）
- 既有 createTournament 相关测试改造为 shell + assignGroups 组合
- 公开页空态语义不变（老赛季无赛事仍返回 null）

## 8. 范围外

- 一季多赛事（本设计保留扩展可能，不实现）
- M2 内容（BP/选手数据/MVP/数据榜、read-model 收窄 version/config、status 自动 FINISHED）
- 生产数据迁移（无 schema 变更；现网"E2E 测试赛季/大王杯S-1"无需处理）
