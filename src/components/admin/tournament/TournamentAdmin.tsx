'use client';

import { useAdminTournamentState } from '@/hooks/useTournamentState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
    return <div className="text-muted-foreground text-sm">加载中…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">赛事管理</h1>
        {state?.tournament && (
          <p className="text-sm text-muted-foreground">
            {state.tournament.name} · {state.tournament.kind} · {state.tournament.status}
          </p>
        )}
      </div>

      <Tabs defaultValue="setup">
        <TabsList>
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
