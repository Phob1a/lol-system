'use client';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function BracketTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const teamName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);

  const advancing = useMemo(() => {
    const result: Array<{ teamId: string; label: string }> = [];
    for (const gId of Object.keys(state.standings.byGroup)) {
      const group = state.groups.find(g => g.id === gId);
      const groupLetter = group?.letter ?? '?';
      const rows = state.standings.byGroup[gId];
      const top = rows.slice(0, state.tournament.advancingPerGroup);
      top.forEach((r, i) => {
        result.push({ teamId: r.teamId, label: `${groupLetter}${i + 1} ${teamName(r.teamId)}` });
      });
    }
    return result;
  }, [state.groups, state.standings.byGroup, state.tournament.advancingPerGroup, teamName]);

  const [slots, setSlots] = useState<Array<string | null>>(Array(8).fill(null));
  const usedSet = new Set(slots.filter(Boolean) as string[]);
  const available = advancing.filter(a => !usedSet.has(a.teamId));

  function assignSlot(idx: number, teamId: string) {
    const next = [...slots];
    next[idx] = teamId;
    setSlots(next);
  }

  function clearSlot(idx: number) {
    const next = [...slots];
    next[idx] = null;
    setSlots(next);
  }

  function submitSeed() {
    if (slots.some(s => !s)) { toast.error('请填满 8 个位置'); return; }
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/bracket/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `提交失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function lock() {
    if (!confirm('锁定对阵?锁定后将进入淘汰赛阶段。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/bracket/lock`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `锁定失败 (${res.status})`);
        return;
      }
      toast.success('对阵已锁定,进入淘汰赛');
      onChange();
    });
  }

  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const bracketLocked = state.tournament.status === 'KNOCKOUT' || state.tournament.status === 'FINISHED';

  if (state.tournament.status === 'BRACKET_SEEDING' && knockout.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-medium">排八强对阵</h3>
        <div className="grid grid-cols-2 gap-3">
          {slots.map((slot, idx) => (
            <div key={idx} className="border rounded p-3 flex items-center justify-between">
              <span className="text-sm font-mono">Slot {idx + 1}</span>
              {slot ? (
                <span className="flex items-center gap-2">
                  <span>{teamName(slot)}</span>
                  <button onClick={() => clearSlot(idx)} className="text-xs underline">清除</button>
                </span>
              ) : (
                <select onChange={e => assignSlot(idx, e.target.value)} value="" className="border rounded p-1 text-sm">
                  <option value="">选择…</option>
                  {available.map(a => (
                    <option key={a.teamId} value={a.teamId}>{a.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <button disabled={pending} onClick={submitSeed}
                className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
          {pending ? '提交中…' : '保存对阵'}
        </button>
      </div>
    );
  }

  if (state.tournament.status === 'BRACKET_SEEDING' && knockout.length > 0) {
    return (
      <div className="space-y-4">
        <BracketTree state={state} teamName={teamName} />
        <button disabled={pending} onClick={lock}
                className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
          {pending ? '锁定中…' : '锁定对阵 → 开始淘汰赛'}
        </button>
      </div>
    );
  }

  if (bracketLocked) {
    return <BracketTree state={state} teamName={teamName} />;
  }

  return <div className="text-muted-foreground">需要先完成小组赛并关闭。</div>;
}

function BracketTree({ state, teamName }:
  { state: TournamentState; teamName: (id: string | null) => string }) {
  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const byRound = [0, 1, 2].map(r => knockout.filter(m => m.roundIndex === r)
    .sort((a, b) => (a.matchIndex ?? 0) - (b.matchIndex ?? 0)));
  return (
    <div className="flex gap-4 overflow-x-auto">
      {byRound.map((round, ri) => (
        <div key={ri} className="flex flex-col gap-4 min-w-[200px]">
          <h4 className="text-sm font-medium">{(['QF', 'SF', 'FINAL'] as const)[ri]}</h4>
          {round.map(m => (
            <div key={m.id} className="border rounded p-2 text-sm">
              <div>{teamName(m.teamAId)} ({m.seriesScore.a})</div>
              <div className="text-muted-foreground">vs</div>
              <div>{teamName(m.teamBId)} ({m.seriesScore.b})</div>
              <div className="text-xs text-muted-foreground mt-1">{m.format} · {m.status}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
