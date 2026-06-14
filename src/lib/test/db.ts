import { PrismaClient } from '@prisma/client';

// A dedicated client bound to TEST_DATABASE_URL. Never import this in app code.
export const testDb = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

// Truncate every domain table. Call in beforeEach for isolation.
export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "game_player_stats", "game_ban_picks", "games",
      "match_advancement_edges", "matches", "tournament_group_teams",
      "tournament_groups", "tournament_stages", "tournament_team_players",
      "tournament_teams", "tournaments",
      "draft_events", "draft_picks", "draft_rounds", "draft_sessions",
      "team_slots", "teams", "registrations", "players", "users"
    RESTART IDENTITY CASCADE;
  `);
}
