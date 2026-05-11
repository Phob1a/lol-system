'use client';
import { useState } from 'react';
import { useTournamentState } from '@/hooks/useTournamentState';
import { SetupTab } from './SetupTab';
import { GroupsTab } from './GroupsTab';
import { MatchesTab } from './MatchesTab';
import { BracketTab } from './BracketTab';
import { AuditTab } from './AuditTab';

type TabId = 'setup' | 'groups' | 'matches' | 'bracket' | 'audit';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'groups', label: '分组' },
  { id: 'matches', label: '比赛' },
  { id: 'bracket', label: '淘汰赛' },
  { id: 'audit', label: '审计' },
];

export function TournamentTabs({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<TabId>('setup');
  const { state, loading, error, refetch } = useTournamentState(tournamentId);

  if (loading) return <div className="p-6">加载中…</div>;
  if (error || !state) return <div className="p-6 text-red-600">加载失败: {error}</div>;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{state.tournament.name}</h1>
        <span className="text-sm text-muted-foreground">{state.tournament.status}</span>
      </header>
      <nav className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 -mb-px border-b-2 ${tab === t.id ? 'border-primary' : 'border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'setup' && <SetupTab state={state} onChange={refetch} />}
      {tab === 'groups' && <GroupsTab state={state} onChange={refetch} />}
      {tab === 'matches' && <MatchesTab state={state} onChange={refetch} />}
      {tab === 'bracket' && <BracketTab state={state} onChange={refetch} />}
      {tab === 'audit' && <AuditTab tournamentId={tournamentId} />}
    </div>
  );
}
