-- DropForeignKey
ALTER TABLE "game_ban_picks" DROP CONSTRAINT "game_ban_picks_teamId_fkey";

-- DropForeignKey
ALTER TABLE "game_player_stats" DROP CONSTRAINT "game_player_stats_teamId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_blueTeamId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_mvpRegistrationId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_winnerTeamId_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_tournamentId_groupId_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_tournamentId_stageId_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_tournamentId_teamAId_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_tournamentId_teamBId_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_tournamentId_winnerTeamId_fkey";

-- DropForeignKey
ALTER TABLE "tournament_group_teams" DROP CONSTRAINT "tournament_group_teams_tournamentId_groupId_fkey";

-- DropForeignKey
ALTER TABLE "tournament_group_teams" DROP CONSTRAINT "tournament_group_teams_tournamentId_teamId_fkey";

-- DropForeignKey
ALTER TABLE "tournament_groups" DROP CONSTRAINT "tournament_groups_tournamentId_stageId_fkey";

-- DropForeignKey
ALTER TABLE "tournament_team_players" DROP CONSTRAINT "tournament_team_players_tournamentId_tournamentTeamId_fkey";

-- DropIndex
DROP INDEX "game_ban_picks_teamId_idx";

-- DropIndex
DROP INDEX "game_player_stats_teamId_idx";

-- DropIndex
DROP INDEX "tournament_group_teams_teamId_idx";

-- DropIndex
DROP INDEX "tournament_groups_stageId_name_key";

-- DropIndex
DROP INDEX "tournament_groups_tournamentId_id_key";

-- DropIndex
DROP INDEX "tournament_stages_tournamentId_id_key";

-- DropIndex
DROP INDEX "tournament_stages_tournamentId_order_key";

-- DropIndex
DROP INDEX "tournament_team_players_registrationId_idx";

-- DropIndex
DROP INDEX "tournament_team_players_tournamentId_registrationId_key";

-- DropIndex
DROP INDEX "tournament_teams_tournamentId_id_key";

-- AlterTable
ALTER TABLE "match_advancement_edges" DROP COLUMN "slot",
ADD COLUMN     "slot" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tournament_group_teams" DROP COLUMN "tournamentId";

-- AlterTable
ALTER TABLE "tournament_groups" DROP COLUMN "tournamentId";

-- AlterTable
ALTER TABLE "tournament_team_players" DROP COLUMN "tournamentId";

-- DropEnum
DROP TYPE "BracketSlot";

-- CreateIndex
CREATE UNIQUE INDEX "match_advancement_edges_toMatchId_slot_key" ON "match_advancement_edges"("toMatchId", "slot");

-- AddForeignKey
ALTER TABLE "tournament_team_players" ADD CONSTRAINT "tournament_team_players_tournamentTeamId_fkey" FOREIGN KEY ("tournamentTeamId") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tournament_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tournament_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

