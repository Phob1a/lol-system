-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "availability" TEXT NOT NULL DEFAULT '';

-- RenameIndex
ALTER INDEX "game_team_stats_game_lcu_team_uniq" RENAME TO "game_team_stats_gameId_lcuTeamId_key";

-- RenameIndex
ALTER INDEX "game_team_stats_game_team_uniq" RENAME TO "game_team_stats_gameId_teamId_key";

-- RenameIndex
ALTER INDEX "game_team_stats_team_idx" RENAME TO "game_team_stats_teamId_idx";
