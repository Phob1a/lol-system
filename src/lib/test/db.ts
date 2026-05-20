import { PrismaClient } from '@prisma/client';

// A dedicated client bound to TEST_DATABASE_URL. Never import this in app code.
export const testDb = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

// Truncate every domain table. Call in beforeEach for isolation.
export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      "draft_events", "draft_picks", "draft_rounds", "draft_sessions",
      "team_slots", "teams", "registrations", "players", "users", "seasons"
    RESTART IDENTITY CASCADE;
  `);
}
