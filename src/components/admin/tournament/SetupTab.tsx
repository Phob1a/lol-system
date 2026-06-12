'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { TournamentConfigForm, type TournamentConfigValue } from './TournamentConfigForm';
import type { PublicState } from '@/hooks/useTournamentState';

type Props = {
  seasonId: string;
  state: PublicState;
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
  config: unknown;
}): TournamentConfigValue {
  const cfg = t.config as {
    groupCount?: number;
    teamsPerGroup?: number;
    advancingPerGroup?: number;
    groupBestOf?: 1 | 3 | 5;
    knockoutBestOf?: Record<string, 1 | 3 | 5>;
  } | null | undefined;
  return {
    name: t.name,
    kind: t.kind,
    config: {
      template: 'group-knockout',
      groupCount: cfg?.groupCount ?? 2,
      teamsPerGroup: cfg?.teamsPerGroup ?? 4,
      advancingPerGroup: cfg?.advancingPerGroup ?? 2,
      groupBestOf: cfg?.groupBestOf ?? 1,
      knockoutBestOf: cfg?.knockoutBestOf ?? {},
    },
  };
}

export function SetupTab({ seasonId, state, refetch }: Props) {
  // ── create form state (no-tournament path) ────────────────────────────────
  const [createValue, setCreateValue] = useState<TournamentConfigValue>(DEFAULT_CONFIG);
  const [createValid, setCreateValid] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── edit form state (has-tournament path) ─────────────────────────────────
  const [editValue, setEditValue] = useState<TournamentConfigValue | null>(null);
  const [editValid, setEditValid] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── reset state (danger zone) ─────────────────────────────────────────────
  const [resetting, setResetting] = useState(false);

  // ── with tournament ────────────────────────────────────────────────────────
  if (state?.tournament) {
    const t = state.tournament;
    const isSetup = t.status === 'SETUP';
    const isFinished = t.status === 'FINISHED';

    // Lazy-initialise edit form value from tournament on first render.
    const currentEditValue = editValue ?? tournamentToConfigValue(t);

    async function handleSaveConfig() {
      if (!state?.tournament) return;
      const confirmed = isSetup
        ? window.confirm('修改赛制将清空已保存的分组与参赛名单，确定继续？')
        : true;
      if (!confirmed) return;

      setSaving(true);
      try {
        const body = isSetup
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
        {/* 当前赛事摘要 */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">当前赛事</h2>
          <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">名称</span>
              <span>{t.name}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">类型</span>
              <span>{t.kind}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">状态</span>
              <span>{t.status}</span>
            </div>
          </div>
        </div>

        {/* 修改配置表单（FINISHED 时隐藏） */}
        {!isFinished && (
          <div className="space-y-4 max-w-xl">
            <h2 className="text-sm font-semibold">修改配置</h2>
            <TournamentConfigForm
              value={currentEditValue}
              onChange={(v) => setEditValue(v)}
              onValidityChange={setEditValid}
              showNameField
              showStructure={isSetup}
            />
            <Button
              disabled={!editValid || saving}
              onClick={() => void handleSaveConfig()}
            >
              <LoadingButtonContent loading={saving} loadingText="保存中…">
                保存配置
              </LoadingButtonContent>
            </Button>
          </div>
        )}

        {/* 危险区 */}
        <div className="space-y-2 rounded-md border border-destructive/40 p-4">
          <p className="text-sm font-semibold text-destructive">危险区</p>
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
        </div>
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
          seasonId,
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
    <div className="space-y-6 pt-4 max-w-xl">
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
    </div>
  );
}
