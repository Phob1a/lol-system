'use client';

import { useAdminTournamentState } from '@/hooks/useTournamentState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArenaPanel } from '@/components/public-arena';
import { SetupTab } from './SetupTab';
import { GroupsTab } from './GroupsTab';
import { ScheduleTab } from './ScheduleTab';

type Team = { id: string; name: string };

type Props = {
  tournamentId: string;
  teams: Team[];
};

export function TournamentAdmin({ tournamentId, teams }: Props) {
  const { state, loaded, refetch } = useAdminTournamentState(tournamentId);

  if (!loaded) {
    return (
      <ArenaPanel className="p-5 text-sm text-slate-300">
        正在同步赛事控制台…
      </ArenaPanel>
    );
  }

  return (
    <div className="space-y-4">
      <ArenaPanel
        eyebrow="TOURNAMENT OPERATIONS"
        title="赛事管理"
        className="arena-scanline p-5"
      >
        {state?.tournament ? (
          <div className="flex flex-wrap gap-2 text-sm text-slate-300">
            <span>{state.tournament.name}</span>
            <span className="text-cyan-200/45">/</span>
            <span>{state.tournament.kind}</span>
            <span className="text-cyan-200/45">/</span>
            <span>{state.tournament.status}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-300">当前没有已加载的赛事配置。</p>
        )}
      </ArenaPanel>

      <Tabs defaultValue="setup">
        <TabsList className="bg-slate-950/45">
          <TabsTrigger value="setup">设置</TabsTrigger>
          <TabsTrigger value="groups">分组</TabsTrigger>
          <TabsTrigger value="schedule">赛程</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <SetupTab tournamentId={tournamentId} state={state} refetch={refetch} />
        </TabsContent>

        <TabsContent value="groups">
          <GroupsTab teams={teams} state={state} refetch={refetch} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleTab teams={teams} state={state} refetch={refetch} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
