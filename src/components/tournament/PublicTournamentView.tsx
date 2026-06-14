'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTournamentState } from '@/hooks/useTournamentState';
import { ScheduleList } from '@/components/tournament/ScheduleList';
import { GroupStandings } from '@/components/tournament/GroupStandings';
import { BracketView } from '@/components/tournament/BracketView';
import { LeaderboardView } from '@/components/tournament/LeaderboardView';

export function PublicTournamentView() {
  const { state, loaded } = useTournamentState();

  if (loaded && !state) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">暂未创建赛事</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="schedule" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="schedule">赛程</TabsTrigger>
        <TabsTrigger value="standings">小组赛</TabsTrigger>
        <TabsTrigger value="bracket">对阵图</TabsTrigger>
        <TabsTrigger value="leaderboard">数据榜</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule">
        <ScheduleList matches={state!.matches} />
      </TabsContent>

      <TabsContent value="standings">
        <GroupStandings standings={state!.standings} />
      </TabsContent>

      <TabsContent value="bracket">
        <BracketView
          bracket={state!.bracket}
          standings={state!.standings}
          matches={state!.matches}
        />
      </TabsContent>

      <TabsContent value="leaderboard">
        <LeaderboardView />
      </TabsContent>
    </Tabs>
  );
}
