'use client';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';
import { TeamRenameInline } from '@/components/team/TeamRenameInline';

interface TeamSummary { id: string; name: string }

export function GroupsTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [allTeams, setAllTeams] = useState<TeamSummary[]>([]);
  const [target, setTarget] = useState<string>('A');

  useEffect(() => {
    fetch('/api/draft/state', { cache: 'no-store' })
      .then(r => r.json())
      .then(s => {
        const teams = (s?.teams ?? []) as Array<{ id: string; name: string }>;
        setAllTeams(teams.map(t => ({ id: t.id, name: t.name })));
      })
      .catch(() => setAllTeams([]));
  }, []);

  const assigned = new Set<string>();
  state.groups.forEach(g => g.teams.forEach(t => assigned.add(t.teamId)));
  const unassigned = allTeams.filter(t => !assigned.has(t.id));

  const canStart =
    state.tournament.status === 'NOT_STARTED' &&
    state.groups.length === state.tournament.groupCount &&
    state.groups.every(g => g.teams.length === state.tournament.teamsPerGroup);

  function assign(teamId: string) {
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/groups/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, groupLetter: target }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `分组失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function startGroup() {
    if (!confirm('开始小组赛?之后将不能再调整分组。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/groups/start`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `启动失败 (${res.status})`);
        return;
      }
      toast.success('小组赛已开始');
      onChange();
    });
  }

  const editable = state.tournament.status === 'NOT_STARTED';

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
      <div className="border rounded p-3 space-y-2">
        <h3 className="font-medium">未分组队伍 ({unassigned.length})</h3>
        {!editable && <p className="text-sm text-muted-foreground">分组已锁定</p>}
        {editable && (
          <label className="block text-sm">
            目标小组
            <select className="block w-full border rounded p-2 mt-1"
                    value={target} onChange={e => setTarget(e.target.value)}>
              {state.groups.map(g => (
                <option key={g.id} value={g.letter}>组 {g.letter}</option>
              ))}
            </select>
          </label>
        )}
        <ul className="space-y-1">
          {unassigned.map(team => (
            <li key={team.id} className="flex justify-between items-center border rounded p-2">
              <TeamRenameInline teamId={team.id} currentName={team.name} canEdit={true} onRenamed={() => onChange()} />
              {editable && (
                <button disabled={pending} onClick={() => assign(team.id)}
                        className="text-sm rounded bg-primary text-primary-foreground px-2 py-1">
                  分到 {target}
                </button>
              )}
            </li>
          ))}
          {unassigned.length === 0 && (
            <li className="text-sm text-muted-foreground">全部已分组</li>
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {state.groups.map(g => (
            <div key={g.id} className="border rounded p-3">
              <h3 className="font-medium">组 {g.letter} ({g.teams.length}/{state.tournament.teamsPerGroup})</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {g.teams.map(t => (
                  <li key={t.teamId} className="border rounded px-2 py-1">
                    <TeamRenameInline teamId={t.teamId} currentName={t.name} canEdit={true} onRenamed={() => onChange()} />
                  </li>
                ))}
                {g.teams.length === 0 && (
                  <li className="text-muted-foreground">空</li>
                )}
              </ul>
            </div>
          ))}
        </div>
        {editable && (
          <button onClick={startGroup} disabled={!canStart || pending}
                  className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
            {pending ? '启动中…' : '开始小组赛'}
          </button>
        )}
      </div>
    </div>
  );
}
