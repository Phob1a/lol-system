/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `teams` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('NOT_STARTED', 'GROUP_STAGE', 'BRACKET_SEEDING', 'KNOCKOUT', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('GROUP', 'TIEBREAKER', 'QF', 'SF', 'FINAL');

-- CreateEnum
CREATE TYPE "MatchFormat" AS ENUM ('BO1', 'BO3', 'BO5');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'WALKOVER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentEventType" AS ENUM ('TOURNAMENT_CREATED', 'GROUPS_DEFINED', 'TEAM_ASSIGNED', 'MATCHES_GENERATED', 'MATCH_SCHEDULED', 'MATCH_RESCHEDULED', 'GAME_RECORDED', 'GAME_REVOKED', 'MATCH_FINISHED', 'MATCH_EDITED', 'MATCH_WALKOVER', 'TIEBREAKER_CREATED', 'GROUP_STAGE_CLOSED', 'BRACKET_SEEDED', 'BRACKET_LOCKED', 'KNOCKOUT_ADVANCED', 'TOURNAMENT_FINISHED', 'TOURNAMENT_RESET');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "groupCount" INTEGER NOT NULL,
    "teamsPerGroup" INTEGER NOT NULL,
    "advancingPerGroup" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "championId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_teams" (
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,

    CONSTRAINT "group_teams_pkey" PRIMARY KEY ("groupId","teamId")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "phase" "MatchPhase" NOT NULL,
    "format" "MatchFormat" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "groupId" TEXT,
    "roundIndex" INTEGER,
    "matchIndex" INTEGER,
    "nextMatchId" TEXT,
    "nextSide" TEXT,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "winnerTeamId" TEXT,
    "walkoverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_games" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "winnerTeamId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_events" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" "TournamentEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_tournamentId_letter_key" ON "groups"("tournamentId", "letter");

-- CreateIndex
CREATE UNIQUE INDEX "group_teams_teamId_key" ON "group_teams"("teamId");

-- CreateIndex
CREATE INDEX "matches_tournamentId_phase_idx" ON "matches"("tournamentId", "phase");

-- CreateIndex
CREATE INDEX "matches_scheduledAt_idx" ON "matches"("scheduledAt");

-- CreateIndex
CREATE INDEX "matches_groupId_idx" ON "matches"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "match_games_matchId_gameNumber_key" ON "match_games"("matchId", "gameNumber");

-- CreateIndex
CREATE INDEX "tournament_events_tournamentId_createdAt_idx" ON "tournament_events"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_events_tournamentId_seq_key" ON "tournament_events"("tournamentId", "seq");

-- Backfill: ensure team names are unique before applying the unique index
WITH dups AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt") AS rn
  FROM teams
)
UPDATE teams t
SET name = t.name || '-' || dups.rn
FROM dups
WHERE t.id = dups.id AND dups.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_championId_fkey" FOREIGN KEY ("championId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teams" ADD CONSTRAINT "group_teams_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teams" ADD CONSTRAINT "group_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_nextMatchId_fkey" FOREIGN KEY ("nextMatchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_events" ADD CONSTRAINT "tournament_events_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
