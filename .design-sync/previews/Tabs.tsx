import { Tabs, TabsList, TabsTrigger, TabsContent } from 'lol-system';

export function Default() {
  return (
    <Tabs defaultValue="overview" style={{ width: 440 }}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="roster">Roster</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
          Cloud Nine is seeded #2 in Group A with a 6–2 record heading into the
          knockout stage.
        </p>
      </TabsContent>
      <TabsContent value="roster">
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
          5 starters and 1 substitute. Roster locks at the bracket draw.
        </p>
      </TabsContent>
      <TabsContent value="schedule">
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
          Next match: Quarterfinal vs Team Liquid, Saturday 18:00.
        </p>
      </TabsContent>
    </Tabs>
  );
}
