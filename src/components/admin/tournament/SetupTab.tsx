'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import type { PublicState } from '@/hooks/useTournamentState';

type Team = { id: string; name: string };

type Props = {
  seasonId: string;
  teams: Team[];
  state: PublicState;
  refetch: () => Promise<void>;
};

const ROUND_KEYS_FOR_ADVANCING: Record<number, string[]> = {
  2: ['FINAL'],
  4: ['SF', 'FINAL'],
  8: ['QF', 'SF', 'FINAL'],
  16: ['R16', 'QF', 'SF', 'FINAL'],
};

const KIND_OPTIONS = [
  { value: '正赛', label: '正赛' },
  { value: '娱乐赛', label: '娱乐赛' },
  { value: '海斗', label: '海斗' },
  { value: '__custom__', label: '自定义' },
];

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function SetupTab({ seasonId, teams, state, refetch }: Props) {
  // ── create form state ─────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [kindSelect, setKindSelect] = useState('正赛');
  const [kindCustom, setKindCustom] = useState('');
  const [groupCount, setGroupCount] = useState(2);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);
  const [advancingPerGroup, setAdvancingPerGroup] = useState(2);
  const [groupBestOf, setGroupBestOf] = useState<1 | 3 | 5>(1);
  const [knockoutBestOf, setKnockoutBestOf] = useState<Record<string, 1 | 3 | 5>>({});
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const totalAdvancing = groupCount * advancingPerGroup;
  const roundKeys = useMemo(
    () => ROUND_KEYS_FOR_ADVANCING[totalAdvancing] ?? [],
    [totalAdvancing],
  );

  const koBoMap = useMemo(() => {
    const map: Record<string, 1 | 3 | 5> = {};
    for (const rk of roundKeys) {
      map[rk] = knockoutBestOf[rk] ?? 1;
    }
    return map;
  }, [roundKeys, knockoutBestOf]);

  const expectedTeams = groupCount * teamsPerGroup;
  const teamsOk = selectedTeamIds.size === expectedTeams;
  const advancingOk = [2, 4, 8, 16].includes(totalAdvancing) && isPowerOfTwo(totalAdvancing);
  const formValid =
    name.trim().length > 0 && teamsOk && advancingOk && roundKeys.length > 0;

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setKoBO(rk: string, bo: 1 | 3 | 5) {
    setKnockoutBestOf((prev) => ({ ...prev, [rk]: bo }));
  }

  async function handleCreate() {
    const kind = kindSelect === '__custom__' ? kindCustom.trim() : kindSelect;
    if (!kind) {
      toast.error('请填写自定义赛事类型');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tournament/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          name: name.trim(),
          kind,
          teamIds: Array.from(selectedTeamIds),
          config: {
            template: 'group-knockout',
            groupCount,
            teamsPerGroup,
            advancingPerGroup,
            groupBestOf,
            knockoutBestOf: koBoMap,
          },
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
      setSubmitting(false);
    }
  }

  // ── delete state ──────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!state?.tournament) return;
    const first = window.confirm('确认删除赛事？此操作不可撤销，所有比赛数据将一并删除。');
    if (!first) return;
    const input = window.prompt(`请输入赛事名称确认删除：「${state.tournament.name}」`);
    if (input !== state.tournament.name) {
      toast.error('赛事名称不匹配，已取消');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/tournament/admin', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournamentId: state.tournament.id }),
      });
      if (res.ok) {
        toast.success('赛事已删除');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '删除失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  // ── with tournament: summary + danger zone ────────────────────────────────
  if (state?.tournament) {
    const t = state.tournament;
    return (
      <div className="space-y-6 pt-4">
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

        <div className="space-y-2 rounded-md border border-destructive/40 p-4">
          <p className="text-sm font-semibold text-destructive">危险区</p>
          <p className="text-xs text-muted-foreground">删除赛事将清除所有比赛数据，且不可恢复。</p>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            <LoadingButtonContent loading={deleting} loadingText="删除中…">
              删除赛事
            </LoadingButtonContent>
          </Button>
        </div>
      </div>
    );
  }

  // ── no tournament: create form ────────────────────────────────────────────
  return (
    <div className="space-y-6 pt-4 max-w-xl">
      {/* 赛事名 */}
      <div className="space-y-1">
        <Label htmlFor="t-name">赛事名</Label>
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：2025 夏季正赛"
        />
      </div>

      {/* 类型 */}
      <div className="space-y-1">
        <Label>类型</Label>
        <Select value={kindSelect} onValueChange={setKindSelect}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kindSelect === '__custom__' && (
          <Input
            className="mt-1"
            value={kindCustom}
            onChange={(e) => setKindCustom(e.target.value)}
            placeholder="输入自定义类型名称"
          />
        )}
      </div>

      {/* 结构参数 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="t-groups">组数</Label>
          <Input
            id="t-groups"
            type="number"
            min={1}
            value={groupCount}
            onChange={(e) => setGroupCount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-tpg">每组队数</Label>
          <Input
            id="t-tpg"
            type="number"
            min={1}
            value={teamsPerGroup}
            onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-apg">每组出线数</Label>
          <Input
            id="t-apg"
            type="number"
            min={1}
            value={advancingPerGroup}
            onChange={(e) => setAdvancingPerGroup(Number(e.target.value))}
          />
        </div>
      </div>

      {/* 小组 BO */}
      <div className="space-y-1">
        <Label>小组赛 BO</Label>
        <Select
          value={String(groupBestOf)}
          onValueChange={(v) => setGroupBestOf(Number(v) as 1 | 3 | 5)}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">BO1</SelectItem>
            <SelectItem value="3">BO3</SelectItem>
            <SelectItem value="5">BO5</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 淘汰赛各轮 BO */}
      {roundKeys.length > 0 ? (
        <div className="space-y-2">
          <Label>淘汰赛各轮 BO</Label>
          {roundKeys.map((rk) => (
            <div key={rk} className="flex items-center gap-3">
              <span className="w-16 text-sm text-muted-foreground">{rk}</span>
              <Select
                value={String(koBoMap[rk] ?? 1)}
                onValueChange={(v) => setKoBO(rk, Number(v) as 1 | 3 | 5)}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">BO1</SelectItem>
                  <SelectItem value="3">BO3</SelectItem>
                  <SelectItem value="5">BO5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : (
        totalAdvancing > 0 && (
          <p className="text-xs text-destructive">
            出线总数（{totalAdvancing}）须为 2/4/8/16 之一
          </p>
        )
      )}

      {/* 参赛队 checkbox 列表 */}
      <div className="space-y-2">
        <Label>
          参赛队{' '}
          <span className={teamsOk ? 'text-muted-foreground' : 'text-destructive'}>
            （已选 {selectedTeamIds.size} / 需 {expectedTeams}）
          </span>
        </Label>
        <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto rounded-md border p-3">
          {teams.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2">暂无队伍</p>
          )}
          {teams.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selectedTeamIds.has(t.id)}
                onCheckedChange={() => toggleTeam(t.id)}
              />
              {t.name}
            </label>
          ))}
        </div>
        {!teamsOk && selectedTeamIds.size > 0 && (
          <p className="text-xs text-destructive">
            勾选队数须等于 组数×每组队数（{expectedTeams}）
          </p>
        )}
      </div>

      <Button
        disabled={!formValid || submitting}
        onClick={() => void handleCreate()}
      >
        <LoadingButtonContent loading={submitting} loadingText="创建中…">
          创建赛事
        </LoadingButtonContent>
      </Button>
    </div>
  );
}
