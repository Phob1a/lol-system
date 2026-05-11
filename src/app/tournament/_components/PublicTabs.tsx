'use client';
import { useState, useMemo } from 'react';
import { useTournamentState } from '@/hooks/useTournamentState';
import type { TournamentState, MatchView } from '@/lib/tournament/tournament-state';

type Tab = 'schedule' | 'groups' | 'bracket';

export function PublicTabs({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<Tab>('schedule');
  const { state, loading, error } = useTournamentState(tournamentId);

  if (loading) return <div className="container mx-auto p-6">加载中…</div>;
  if (error || !state) return <div className="container mx-auto p-6 text-red-600">加载失败: {error}</div>;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{state.tournament.name}</h1>
      <nav className="flex gap-2 border-b">
        {[
          { id: 'schedule' as const, label: '赛程' },
          { id: 'groups' as const, label: '小组' },
          { id: 'bracket' as const, label: '淘汰赛' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 -mb-px border-b-2 ${tab === t.id ? 'border-primary' : 'border-transparent'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'schedule' && <ScheduleView state={state} />}
      {tab === 'groups' && <GroupsView state={state} />}
      {tab === 'bracket' && <BracketView state={state} />}
    </div>
  );
}

function ScheduleView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  const buckets = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);
    const tomorrowKey = ymd(new Date(now.getTime() + 86_400_000));
    const groups: Record<string, MatchView[]> = { Today: [], Tomorrow: [], 'This Week': [], Past: [], Unscheduled: [] };
    for (const m of state.schedule) {
      if (!m.scheduledAt) { groups.Unscheduled.push(m); continue; }
      const d = new Date(m.scheduledAt);
      const key = ymd(d);
      if (key === todayKey) groups.Today.push(m);
      else if (key === tomorrowKey) groups.Tomorrow.push(m);
      else if (d.getTime() < now.getTime()) groups.Past.push(m);
      else groups['This Week'].push(m);
    }
    return groups;
  }, [state.schedule]);

  return (
    <div className="space-y-4">
      {Object.entries(buckets).map(([k, ms]) =>
        ms.length === 0 ? null : (
          <section key={k}>
            <h3 className="font-medium mb-1">{k}</h3>
            <table className="w-full text-sm border">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">阶段</th>
                  <th className="p-2 text-left">对阵</th>
                  <th className="p-2 text-center">比分</th>
                  <th className="p-2 text-left">状态</th>
                  <th className="p-2 text-left">时间</th>
                </tr>
              </thead>
              <tbody>
                {ms.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">{m.phase}</td>
                    <td className="p-2">{tName(m.teamAId)} vs {tName(m.teamBId)}</td>
                    <td className="p-2 text-center">{m.seriesScore.a} - {m.seriesScore.b}</td>
                    <td className="p-2">{m.status}</td>
                    <td className="p-2">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </div>
  );
}

function GroupsView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {state.groups.map(g => {
        const rows = state.standings.byGroup[g.id] ?? [];
        const tied = state.standings.tieGroups.find(tg => tg.groupId === g.id);
        return (
          <div key={g.id} className="border rounded p-3">
            <h3 className="font-medium">组 {g.letter}</h3>
            <table className="w-full text-sm mt-2">
              <thead>
                <tr><th className="text-left">队伍</th><th>W</th><th>L</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.teamId} className={tied?.tiedTeamIds.includes(r.teamId) ? 'text-amber-600' : ''}>
                    <td>{tName(r.teamId)}</td>
                    <td className="text-center">{r.wins}</td>
                    <td className="text-center">{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tied && <p className="text-xs text-amber-600 mt-2">存在并列,待加赛</p>}
          </div>
        );
      })}
    </div>
  );
}

function BracketView({ state }: { state: TournamentState }) {
  const tName = useTeamName(state);
  const knockout = state.matches.filter(m => m.phase === 'QF' || m.phase === 'SF' || m.phase === 'FINAL');
  const byRound = [0, 1, 2].map(r => knockout.filter(m => m.roundIndex === r)
    .sort((a, b) => (a.matchIndex ?? 0) - (b.matchIndex ?? 0)));
  if (knockout.length === 0) {
    return <div className="text-muted-foreground">小组赛尚未结束,淘汰赛对阵未生成。</div>;
  }
  return (
    <div className="flex gap-4 overflow-x-auto">
      {byRound.map((round, ri) => (
        <div key={ri} className="flex flex-col gap-4 min-w-[200px]">
          <h4 className="text-sm font-medium">{['八强', '四强', '决赛'][ri]}</h4>
          {round.map(m => (
            <div key={m.id} className="border rounded p-2 text-sm">
              <div className={m.winnerTeamId === m.teamAId ? 'font-semibold' : ''}>
                {tName(m.teamAId)} ({m.seriesScore.a})
              </div>
              <div className={m.winnerTeamId === m.teamBId ? 'font-semibold' : ''}>
                {tName(m.teamBId)} ({m.seriesScore.b})
              </div>
              <div className="text-xs text-muted-foreground mt-1">{m.format} · {m.status}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function useTeamName(state: TournamentState) {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const g of state.groups) for (const t of g.teams) map.set(t.teamId, t.name);
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 6) : '—');
  }, [state.groups]);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
