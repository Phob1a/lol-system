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
      "team_slots", "teams", "registrations", "players", "users",
      "match_imports"
    RESTART IDENTITY CASCADE;
  `);
  // 生产迁移里手写的 partial unique index（同一 externalGameId 仅允许一条 COMMITTED）。
  // 该约束不在 schema.prisma 里，`prisma db push` 引导的测试库不会创建它；幂等补建以保证
  // COMMITTED 去重（commitImport 的 P2002 → CONFLICT）在测试环境下可被验证。
  await testDb.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "match_imports_external_committed_uniq"
      ON "match_imports" ("externalGameId")
      WHERE "status" = 'COMMITTED';
  `);
}
