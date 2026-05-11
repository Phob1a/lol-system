'use client';
import { useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import type { TournamentState, MatchView } from '@/lib/tournament/tournament-state';

export function MatchesTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const teamName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);

  const byPhase = useMemo(() => {
    const grouped: Record<string, MatchView[]> = {};
    for (const m of state.matches) {
      grouped[m.phase] = grouped[m.phase] ?? [];
      grouped[m.phase].push(m);
    }
    return grouped;
  }, [state.matches]);

  function recordGame(m: MatchView, winnerTeamId: string) {
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/game`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerTeamId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `录入失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function revokeLast(m: MatchView) {
    if (!confirm(`撤销 ${teamName(m.teamAId)} vs ${teamName(m.teamBId)} 的最后一局?`)) return;
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/game`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `撤销失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function setSchedule(m: MatchView) {
    const v = prompt(
      '请输入开打时间 (ISO 格式, 如 2026-06-01T19:00:00+08:00)',
      m.scheduledAt ?? '',
    );
    if (!v) return;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      toast.error('时间格式无效');
      return;
    }
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt: d.toISOString() }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `排期失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  function walkover(m: MatchView) {
    if (!m.teamAId || !m.teamBId) return;
    const choice = prompt(
      `输入胜方 (A=${teamName(m.teamAId)}, B=${teamName(m.teamBId)}) 后跟 / 和备注,例如:\nA / 对手未到`,
    );
    if (!choice) return;
    const [sideRaw, note] = choice.split('/').map(s => s.trim());
    const side = sideRaw?.toUpperCase();
    const winnerTeamId = side === 'A' ? m.teamAId : side === 'B' ? m.teamBId : null;
    if (!winnerTeamId) { toast.error('未识别胜方'); return; }
    start(async () => {
      const res = await fetch(
        `/api/tournament/${state.tournament.id}/match/${m.id}/walkover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerTeamId, note }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `弃权登记失败 (${res.status})`);
        return;
      }
      onChange();
    });
  }

  const phaseOrder = ['GROUP', 'TIEBREAKER', 'QF', 'SF', 'FINAL'] as const;

  return (
    <div className="space-y-6">
      {phaseOrder.map(phase => {
        const ms = byPhase[phase];
        if (!ms || ms.length === 0) return null;
        return (
          <section key={phase}>
            <h3 className="font-medium mb-2">{phase}</h3>
            <table className="w-full text-sm border">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">对阵</th>
                  <th className="p-2">系列比分</th>
                  <th className="p-2">状态</th>
                  <th className="p-2">开打时间</th>
                  <th className="p-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {ms.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">
                      {teamName(m.teamAId)} vs {teamName(m.teamBId)}
                    </td>
                    <td className="p-2 text-center">{m.seriesScore.a} - {m.seriesScore.b} <span className="text-muted-foreground">({m.format})</span></td>
                    <td className="p-2 text-center">{m.status}</td>
                    <td className="p-2">
                      {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : '—'}
                    </td>
                    <td className="p-2 text-right space-x-2">
                      <button disabled={pending} onClick={() => setSchedule(m)} className="text-xs underline">排期</button>
                      {m.teamAId && m.teamBId && m.status !== 'FINISHED' && m.status !== 'WALKOVER' && (
                        <>
                          <button disabled={pending} onClick={() => recordGame(m, m.teamAId!)} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
                            A胜 {teamName(m.teamAId)}
                          </button>
                          <button disabled={pending} onClick={() => recordGame(m, m.teamBId!)} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
                            B胜 {teamName(m.teamBId)}
                          </button>
                          <button disabled={pending} onClick={() => walkover(m)} className="text-xs underline">弃权</button>
                        </>
                      )}
                      {m.games.length > 0 && (
                        <button disabled={pending} onClick={() => revokeLast(m)} className="text-xs underline text-destructive">撤销上一局</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {state.tournament.status === 'GROUP_STAGE' && (
        <CloseGroupStageButton state={state} onChange={onChange} />
      )}
    </div>
  );
}

function CloseGroupStageButton({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  function close() {
    start(async () => {
      const res = await fetch(`/api/tournament/${state.tournament.id}/close-group-stage`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.tieGroups) {
          toast.error(`存在未决并列,请先安排加赛: ${JSON.stringify(body.tieGroups)}`);
          return;
        }
        toast.error(body.error ?? `关闭失败 (${res.status})`);
        return;
      }
      toast.success('小组赛已关闭,进入排阵阶段');
      onChange();
    });
  }
  return (
    <button disabled={pending} onClick={close}
            className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
      {pending ? '关闭中…' : '关闭小组赛'}
    </button>
  );
}
