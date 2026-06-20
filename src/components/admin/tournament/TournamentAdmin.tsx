'use client';

import { useState } from 'react';
import { useAdminTournamentState } from '@/hooks/useTournamentState';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import { SetupTab } from './SetupTab';
import { GroupsTab } from './GroupsTab';
import { ScheduleTab } from './ScheduleTab';

type Team = { id: string; name: string };

type Props = {
  tournamentId: string;
  teams: Team[];
};

const TABS = [
  { key: 'setup', label: '设置' },
  { key: 'groups', label: '分组' },
  { key: 'schedule', label: '赛程' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function TournamentAdmin({ tournamentId, teams }: Props) {
  const { state, loaded, refetch } = useAdminTournamentState(tournamentId);
  const [activeTab, setActiveTab] = useState<TabKey>('setup');

  if (!loaded) {
    return (
      <div className="font-mono text-[11px] text-nexus-faint py-6">加载中…</div>
    );
  }

  const tournament = state?.tournament;

  return (
    <Panel glow>
      <PanelHead
        title="TOURNAMENT · 赛事控制"
        actions={
          tournament ? (
            <Chip variant="ac">{tournament.status}</Chip>
          ) : null
        }
      >
        {/* Tab strip inside header */}
        <div className="flex items-center gap-1 ml-4" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'inline-flex items-center',
                  'px-4 py-2',
                  'font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
                  'border-b-2 transition-colors duration-150 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-nexus-accent',
                  isActive
                    ? 'text-nexus-accent border-nexus-accent'
                    : 'text-nexus-faint border-transparent hover:text-nexus-dim hover:border-nexus-line',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </PanelHead>

      {tournament && (
        <div className="px-5 py-2 border-b border-nexus-line/60 flex items-center gap-4">
          <Kicker>{tournament.name}</Kicker>
          <span className="text-nexus-line">·</span>
          <Kicker>{tournament.kind}</Kicker>
        </div>
      )}

      <div className="p-5" role="tabpanel">
        {activeTab === 'setup' && (
          <SetupTab tournamentId={tournamentId} state={state} refetch={refetch} />
        )}
        {activeTab === 'groups' && (
          <GroupsTab teams={teams} state={state} refetch={refetch} />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab teams={teams} state={state} refetch={refetch} />
        )}
      </div>
    </Panel>
  );
}
