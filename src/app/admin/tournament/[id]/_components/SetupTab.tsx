'use client';
import { useTransition } from 'react';
import { toast } from 'sonner';
import type { TournamentState } from '@/lib/tournament/tournament-state';

export function SetupTab({ state, onChange }: { state: TournamentState; onChange: () => void }) {
  const [pending, start] = useTransition();
  const t = state.tournament;

  function reset() {
    if (!confirm('重置当前赛事?将归档现有数据,不可逆。')) return;
    start(async () => {
      const res = await fetch(`/api/tournament/${t.id}/reset`, { method: 'POST' });
      if (!res.ok) {
        toast.error(`重置失败 (${res.status})`);
        return;
      }
      toast.success('赛事已归档');
      window.location.href = '/admin/tournament';
    });
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-y-2 max-w-md">
        <dt className="text-muted-foreground">名称</dt><dd>{t.name}</dd>
        <dt className="text-muted-foreground">状态</dt><dd>{t.status}</dd>
        <dt className="text-muted-foreground">小组数</dt><dd>{t.groupCount}</dd>
        <dt className="text-muted-foreground">每组队数</dt><dd>{t.teamsPerGroup}</dd>
        <dt className="text-muted-foreground">每组出线</dt><dd>{t.advancingPerGroup}</dd>
        <dt className="text-muted-foreground">事件序列</dt><dd>{t.seq}</dd>
        {t.championId && (<><dt className="text-muted-foreground">冠军</dt><dd>{t.championId}</dd></>)}
      </dl>
      <button onClick={reset} disabled={pending}
              className="rounded border border-destructive text-destructive px-4 py-2 disabled:opacity-50">
        {pending ? '重置中…' : '归档并重置赛事'}
      </button>
    </div>
  );
}
