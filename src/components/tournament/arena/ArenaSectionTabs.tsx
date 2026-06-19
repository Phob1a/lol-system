import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BracketView } from '@/components/tournament/BracketView';
import { GroupStandings } from '@/components/tournament/GroupStandings';
import { LeaderboardView } from '@/components/tournament/LeaderboardView';
import { ScheduleList } from '@/components/tournament/ScheduleList';
import type { PublicTournamentState } from '@/lib/tournament/arena-view-model';

type ArenaSectionTabsProps = {
  state: PublicTournamentState;
};

export function ArenaSectionTabs({ state }: ArenaSectionTabsProps) {
  return (
    <section className="relative z-10" id="arena-sections">
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 border border-cyan-200/15 bg-slate-950/50 p-1 sm:grid-cols-4">
          <TabsTrigger id="schedule" value="schedule">
            赛程
          </TabsTrigger>
          <TabsTrigger id="standings" value="standings">
            小组赛
          </TabsTrigger>
          <TabsTrigger id="bracket" value="bracket">
            对阵图
          </TabsTrigger>
          <TabsTrigger id="leaderboard" value="leaderboard">
            数据榜
          </TabsTrigger>
        </TabsList>

        <div className="arena-panel rounded border border-cyan-200/15 bg-slate-950/35 p-4 md:p-5">
          <TabsContent value="schedule">
            <ScheduleList matches={state.matches} />
          </TabsContent>
          <TabsContent value="standings">
            <GroupStandings standings={state.standings} />
          </TabsContent>
          <TabsContent value="bracket">
            <BracketView bracket={state.bracket} standings={state.standings} matches={state.matches} />
          </TabsContent>
          <TabsContent value="leaderboard">
            <LeaderboardView />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
