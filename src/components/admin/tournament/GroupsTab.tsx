'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PublicState } from '@/hooks/useTournamentState';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

type Team = { id: string; name: string };

type Props = {
  teams: Team[];
  state: PublicState;
  refetch: () => Promise<void>;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function GroupsTab({ teams, state, refetch }: Props) {
  const [assignments, setAssignments] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const tournament = state?.tournament ?? null;
  const standings = useMemo(() => state?.standings ?? [], [state?.standings]);
  const isSetup = tournament?.status === 'SETUP';

  const config = tournament?.config as GroupKnockoutConfig | null | undefined;
  const groupCount = config?.groupCount ?? (standings.length > 0 ? standings.length : 2);
  const teamsPerGroup = config?.teamsPerGroup ?? (standings.length > 0
    ? Math.max(...standings.map((g) => Object.keys(g.teams).length), 1)
    : 4);

  useEffect(() => {
    if (standings.length > 0) {
      setAssignments(standings.map((g) => Object.keys(g.teams)));
    } else {
      setAssignments(Array.from({ length: groupCount }, () => Array(teamsPerGroup).fill('')));
    }
  }, [groupCount, teamsPerGroup, standings]);

  if (!tournament) {
    return (
      <div className="pt-4 text-muted-foreground text-sm">请先在「设置」tab 创建赛事。</div>
    );
  }

  if (!isSetup) {
    return (
      <div className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">分组已锁定（状态：{tournament.status}）。</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standings.map((g) => (
            <div key={g.groupId} className="rounded-md border p-4 space-y-2">
              <h3 className="text-sm font-semibold">{g.name}</h3>
              <ul className="space-y-1">
                {Object.entries(g.teams).map(([id, name]) => (
                  <li key={id} className="text-sm text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function pickedExcluding(groupIdx: number, slotIdx: number): Set<string> {
    const picked = new Set<string>();
    assignments.forEach((row, gi) => {
      row.forEach((tid, si) => {
        if (tid && !(gi === groupIdx && si === slotIdx)) {
          picked.add(tid);
        }
      });
    });
    return picked;
  }

  function setSlot(groupIdx: number, slotIdx: number, teamId: string) {
    setAssignments((prev) => {
      const next = prev.map((row) => [...row]);
      next[groupIdx][slotIdx] = teamId;
      return next;
    });
  }

  function handleRandomize() {
    const shuffled = shuffle(teams);
    const result: string[][] = [];
    let cursor = 0;
    for (let g = 0; g < groupCount; g++) {
      const row: string[] = [];
      for (let s = 0; s < teamsPerGroup; s++) {
        row.push(shuffled[cursor]?.id ?? '');
        cursor++;
      }
      result.push(row);
    }
    setAssignments(result);
  }

  function buildAssignmentsPayload() {
    return standings.map((g, gi) => ({
      groupId: g.groupId,
      teamIds: (assignments[gi] ?? []).filter(Boolean),
    }));
  }

  async function handleSave() {
    if (!tournament) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tournament/admin/groups', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          assignments: buildAssignmentsPayload(),
        }),
      });
      if (res.ok) {
        toast.success('分组已保存');
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

  async function handleConfirm() {
    if (!tournament) return;
    setConfirming(true);
    try {
      const putRes = await fetch('/api/tournament/admin/groups', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          assignments: buildAssignmentsPayload(),
        }),
      });
      if (!putRes.ok) {
        const data = await putRes.json().catch(() => ({}));
        toast.error(data.error ?? '保存分组失败');
        return;
      }
      const postRes = await fetch('/api/tournament/admin/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });
      if (postRes.ok) {
        toast.success('分组已确认，对阵已生成');
        await refetch();
      } else {
        const data = await postRes.json().catch(() => ({}));
        toast.error(data.error ?? '确认失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败');
    } finally {
      setConfirming(false);
    }
  }

  const groupNames =
    standings.length > 0
      ? standings.map((g) => g.name)
      : Array.from({ length: groupCount }, (_, i) => `第 ${i + 1} 组`);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleRandomize}>
          随机分组
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          <LoadingButtonContent loading={saving} loadingText="保存中…">
            保存分组
          </LoadingButtonContent>
        </Button>
        <Button
          size="sm"
          disabled={confirming}
          onClick={() => void handleConfirm()}
        >
          <LoadingButtonContent loading={confirming} loadingText="确认中…">
            确认分组并生成对阵
          </LoadingButtonContent>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: groupCount }, (_, gi) => (
          <div key={gi} className="rounded-md border p-4 space-y-3">
            <h3 className="text-sm font-semibold">{groupNames[gi] ?? `第 ${gi + 1} 组`}</h3>
            {Array.from({ length: teamsPerGroup }, (_, si) => {
              const currentId = assignments[gi]?.[si] ?? '';
              const picked = pickedExcluding(gi, si);
              const currentTeam = teams.find((t) => t.id === currentId);
              const availableTeams = teams.filter((t) => !picked.has(t.id));
              // ensure current is in available list
              const showCurrent = currentId && !availableTeams.find((t) => t.id === currentId);
              return (
                <Select
                  key={si}
                  value={currentId || '__empty__'}
                  onValueChange={(v) => setSlot(gi, si, v === '__empty__' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择队伍" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">—</SelectItem>
                    {availableTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                    {showCurrent && currentTeam && (
                      <SelectItem value={currentTeam.id}>{currentTeam.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
