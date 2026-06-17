CREATE TYPE "GameStageTag" AS ENUM ('GROUP', 'KNOCKOUT', 'SEMIFINAL', 'FINAL');

ALTER TABLE "game_player_stats" ADD COLUMN "stageTag" "GameStageTag";

CREATE TABLE "game_team_stats" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "lcuTeamId" INTEGER NOT NULL,
  "win" BOOLEAN NOT NULL,
  "stageTag" "GameStageTag",
  "firstBlood" BOOLEAN,
  "firstTower" BOOLEAN,
  "firstBaron" BOOLEAN,
  "firstDragon" BOOLEAN,
  "firstInhibitor" BOOLEAN,
  "towerKills" INTEGER,
  "inhibitorKills" INTEGER,
  "dragonKills" INTEGER,
  "baronKills" INTEGER,
  "riftHeraldKills" INTEGER,
  "hordeKills" INTEGER,
  "vilemawKills" INTEGER,
  "dominionVictoryScore" INTEGER,
  "bans" JSONB,
  "extStats" JSONB,

  CONSTRAINT "game_team_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_team_stats_game_team_uniq"
  ON "game_team_stats" ("gameId", "teamId");

CREATE UNIQUE INDEX "game_team_stats_game_lcu_team_uniq"
  ON "game_team_stats" ("gameId", "lcuTeamId");

CREATE INDEX "game_team_stats_team_idx"
  ON "game_team_stats" ("teamId");

ALTER TABLE "game_team_stats"
  ADD CONSTRAINT "game_team_stats_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "games"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "game_team_stats"
  ADD CONSTRAINT "game_team_stats_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
