'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ArenaPanel } from '@/components/public-arena';
import type { AdminState } from '@/hooks/useTournamentState';
import { BUDGET_EDITABLE_STATUSES } from '@/lib/tournament/tournament-service';
import { TournamentConfigForm, type TournamentConfigValue } from './TournamentConfigForm';

type Props = {
  tournamentId: string;
  state: AdminState;
  refetch: () => Promise<void>;
};

const DEFAULT_CONFIG: TournamentConfigValue = {
  name: '',
  kind: '正赛',
  config: {
    template: 'group-knockout',
    groupCount: 2,
    teamsPerGroup: 4,
    advancingPerGroup: 2,
    groupBestOf: 1,
    knockoutBestOf: {},
  },
};

function tournamentToConfigValue(t: {
  name: string;
  kind: string;
  config: import('@/lib/tournament/types').GroupKnockoutConfig;
}): TournamentConfigValue {
  return {
    name: t.name,
    kind: t.kind,
    config: {
      template: 'group-knockout',
      groupCount: t.config.groupCount,
      teamsPerGroup: t.config.teamsPerGroup,
      advancingPerGroup: t.config.advancingPerGroup,
      groupBestOf: t.config.groupBestOf,
      knockoutBestOf: t.config.knockoutBestOf,
    },
  };
}

export function SetupTab({ tournamentId, state, refetch }: Props) {
  // ── create form state (no-tournament path) ────────────────────────────────
  const [createValue, setCreateValue] = useState<TournamentConfigValue>(DEFAULT_CONFIG);
  const [createValid, setCreateValid] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── edit form state (has-tournament path) ─────────────────────────────────
  const [editValue, setEditValue] = useState<TournamentConfigValue | null>(null);
  const [editValid, setEditValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetValue, setBudgetValue] = useState<string | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);

  // ── reset state (danger zone) ─────────────────────────────────────────────
  const [resetting, setResetting] = useState(false);

  // ── with tournament ────────────────────────────────────────────────────────
  if (state?.tournament) {
    const t = state.tournament;
    const isFinished = t.status === 'FINISHED';
    // Config is editable (and clears groups) whenever not in late/completed stages.
    const CONFIG_CLEAR_STATUSES = new Set(['GROUP_STAGE', 'KNOCKOUT', 'FINISHED', 'ARCHIVED']);
    const configWillClear = !CONFIG_CLEAR_STATUSES.has(t.status);
    const isConfigEditable = configWillClear;
    const currentBudgetValue = budgetValue ?? String(t.teamBudget);
    const budgetEditable = BUDGET_EDITABLE_STATUSES.some((status) => status === t.status);
    const budgetDirty = currentBudgetValue !== String(t.teamBudget);

    // Lazy-initialise edit form value from tournament on first render.
    const currentEditValue = editValue ?? tournamentToConfigValue(t);

    async function handleSaveConfig() {
      if (!state?.tournament) return;
      const confirmed = configWillClear
        ? window.confirm('修改赛制将清空已保存的分组与参赛名单，确定继续？')
        : true;
      if (!confirmed) return;

      setSaving(true);
      try {
        const body = isConfigEditable
          ? {
              tournamentId: state.tournament.id,
              name: currentEditValue.name,
              kind: currentEditValue.kind,
              config: currentEditValue.config,
            }
          : {
              tournamentId: state.tournament.id,
              name: currentEditValue.name,
              kind: currentEditValue.kind,
            };
        const res = await fetch('/api/tournament/admin', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success('配置已保存');
          setEditValue(null);
          await refetch();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? '保存失败');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSaving(false);
      }
    }

    async function handleSaveBudget() {
      if (!state?.tournament) return;
      const value = Number(currentBudgetValue);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error('预算必须大于 0');
        return;
      }

      setSavingBudget(true);
      try {
        const res = await fetch(`/api/tournament/${state.tournament.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ teamBudget: value }),
        });
        if (res.ok) {
          toast.success('队伍预算已更新');
          setBudgetValue(null);
          await refetch();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? '更新失败');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '更新失败');
      } finally {
        setSavingBudget(false);
      }
    }

    async function handleReset() {
      if (!state?.tournament) return;
      const first = window.confirm(
        '重置将清空全部比赛/分组/比分并回到设置状态，确定继续？',
      );
      if (!first) return;
      const input = window.prompt(
        `请输入赛事名称确认重置：「${state.tournament.name}」`,
      );
      if (input !== state.tournament.name) {
        toast.error('赛事名称不匹配，已取消');
        return;
      }
      setResetting(true);
      try {
        const res = await fetch('/api/tournament/admin/reset', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tournamentId: state.tournament.id }),
        });
        if (res.ok) {
          toast.success('赛事已重置');
          setEditValue(null);
          await refetch();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? '重置失败');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '重置失败');
      } finally {
        setResetting(false);
      }
    }

    return (
      <div className="space-y-6 pt-4">
        <ArenaPanel eyebrow="ACTIVE EVENT" title="当前赛事" className="p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">名称</p>
              <p className="mt-1 font-medium text-slate-100">{t.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">类型</p>
              <p className="mt-1 font-medium text-slate-100">{t.kind}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">状态</p>
              <p className="mt-1 font-medium text-slate-100">{t.status}</p>
            </div>
          </div>
        </ArenaPanel>

        <ArenaPanel className="max-w-xl space-y-4 p-4" eyebrow="BUDGET LOCK" title="队伍总费用">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              每支队伍的初始预算。选秀开始后该值会被锁定，因为各队剩余预算已基于它计算。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="team-budget" className="text-xs text-muted-foreground">
                队伍总费用
              </label>
              <Input
                id="team-budget"
                type="text"
                inputMode="decimal"
                className="w-48"
                value={currentBudgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                disabled={!budgetEditable || savingBudget}
              />
            </div>
            <Button
              disabled={!budgetEditable || savingBudget || !budgetDirty}
              onClick={() => void handleSaveBudget()}
            >
              <LoadingButtonContent loading={savingBudget} loadingText="保存中…">
                保存队伍总费用
              </LoadingButtonContent>
            </Button>
          </div>
          {!budgetEditable && (
            <p className="text-xs text-amber-600">
              队伍预算已锁定（{t.status}），无法修改。
            </p>
          )}
        </ArenaPanel>

        {!isFinished && (
          <ArenaPanel className="max-w-xl space-y-4 p-4" eyebrow="RULESET" title="修改配置">
            <TournamentConfigForm
              value={currentEditValue}
              onChange={(v) => setEditValue(v)}
              onValidityChange={setEditValid}
              showNameField
              showStructure={isConfigEditable}
            />
            <Button
              disabled={!editValid || saving}
              onClick={() => void handleSaveConfig()}
            >
              <LoadingButtonContent loading={saving} loadingText="保存中…">
                保存配置
              </LoadingButtonContent>
            </Button>
          </ArenaPanel>
        )}

        <ArenaPanel
          className="max-w-xl space-y-2 border-red-400/35 bg-red-950/20 p-4"
          eyebrow="DANGER ZONE"
          title="危险区"
        >
          <p className="text-xs text-muted-foreground">
            重置赛事将清空全部比赛、分组及比分数据，回到设置状态，且不可恢复。
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={resetting}
            onClick={() => void handleReset()}
          >
            <LoadingButtonContent loading={resetting} loadingText="重置中…">
              重置赛事
            </LoadingButtonContent>
          </Button>
        </ArenaPanel>
      </div>
    );
  }

  // ── no tournament: create form ────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/tournament/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId,
          name: createValue.name.trim(),
          kind: createValue.kind,
          config: createValue.config,
        }),
      });
      if (res.ok) {
        toast.success('赛事创建成功');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '创建失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }

  return (
    <ArenaPanel className="mt-4 max-w-xl space-y-6 p-4" eyebrow="INITIALIZE" title="创建赛事">
      <TournamentConfigForm
        value={createValue}
        onChange={setCreateValue}
        onValidityChange={setCreateValid}
        showNameField
        showStructure
      />

      <Button
        disabled={!createValid || creating}
        onClick={() => void handleCreate()}
      >
        <LoadingButtonContent loading={creating} loadingText="创建中…">
          创建赛事
        </LoadingButtonContent>
      </Button>
    </ArenaPanel>
  );
}
