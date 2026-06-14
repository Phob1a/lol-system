-- CreateEnum
CREATE TYPE "Position" AS ENUM ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CAPTAIN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "RoundMode" AS ENUM ('MANUAL', 'ADMIN_ORDER', 'REVERSE_LAST', 'BUDGET_DESC');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('DRAFT_STARTED', 'ROUND_STARTED', 'PICK_MADE', 'PICK_REVOKED', 'ROUND_REWOUND', 'DRAFT_RESET', 'SLOT_REARRANGED', 'ORDER_SET');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('GROUP', 'KNOCKOUT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'FINISHED', 'WALKOVER', 'CANCELED');

-- CreateEnum
CREATE TYPE "MatchSource" AS ENUM ('GENERATED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AdvanceOutcome" AS ENUM ('WINNER', 'LOSER');

-- CreateEnum
CREATE TYPE "BanPickType" AS ENUM ('BAN', 'PICK');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('SETUP', 'REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "primaryPositions" "Position"[],
    "secondaryPositions" "Position"[],
    "currentRank" TEXT NOT NULL,
    "peakRank" TEXT NOT NULL,
    "willingToCaptain" BOOLEAN NOT NULL DEFAULT false,
    "statement" TEXT,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'CAPTAIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetLeft" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slogan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_slots" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "registrationId" TEXT,

    CONSTRAINT "team_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_sessions" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "onTheClock" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_rounds" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "mode" "RoundMode" NOT NULL,
    "pickOrder" JSONB NOT NULL DEFAULT '[]',
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_picks" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "pickIndex" INTEGER NOT NULL,
    "byCaptainId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "costPaid" DOUBLE PRECISION NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '正赛',
    "status" "TournamentStatus" NOT NULL DEFAULT 'SETUP',
    "config" JSONB NOT NULL,
    "teamBudget" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_team_players" (
    "tournamentTeamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,

    CONSTRAINT "tournament_team_players_pkey" PRIMARY KEY ("tournamentTeamId","registrationId")
);

-- CreateTable
CREATE TABLE "tournament_stages" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "bestOf" INTEGER NOT NULL,
    "config" JSONB,

    CONSTRAINT "tournament_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_groups" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tournament_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_group_teams" (
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "tournament_group_teams_pkey" PRIMARY KEY ("groupId","teamId")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT,
    "label" TEXT,
    "roundKey" TEXT,
    "bestOf" INTEGER NOT NULL,
    "source" "MatchSource" NOT NULL DEFAULT 'GENERATED',
    "countsForStandings" BOOLEAN NOT NULL DEFAULT true,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winnerTeamId" TEXT,
    "isWalkover" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_advancement_edges" (
    "id" TEXT NOT NULL,
    "fromMatchId" TEXT NOT NULL,
    "toMatchId" TEXT NOT NULL,
    "outcome" "AdvanceOutcome" NOT NULL,
    "slot" TEXT NOT NULL,

    CONSTRAINT "match_advancement_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "blueTeamId" TEXT,
    "winnerTeamId" TEXT,
    "durationSeconds" INTEGER,
    "mvpRegistrationId" TEXT,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_ban_picks" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "BanPickType" NOT NULL,
    "championId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "game_ban_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_player_stats" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "championId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "cs" INTEGER NOT NULL,
    "damage" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,

    CONSTRAINT "game_player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_gameId_key" ON "players"("gameId");

-- CreateIndex
CREATE INDEX "registrations_tournamentId_idx" ON "registrations"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_tournamentId_playerId_key" ON "registrations"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "teams_captainId_key" ON "teams"("captainId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_userId_key" ON "teams"("userId");

-- CreateIndex
CREATE INDEX "teams_tournamentId_idx" ON "teams"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "team_slots_teamId_position_key" ON "team_slots"("teamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "draft_sessions_tournamentId_key" ON "draft_sessions"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_rounds_sessionId_roundNo_key" ON "draft_rounds"("sessionId", "roundNo");

-- CreateIndex
CREATE INDEX "draft_events_sessionId_createdAt_idx" ON "draft_events"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "draft_events_sessionId_seq_key" ON "draft_events"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_teams_tournamentId_teamId_key" ON "tournament_teams"("tournamentId", "teamId");

-- CreateIndex
CREATE INDEX "matches_tournamentId_scheduledAt_idx" ON "matches"("tournamentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "matches_stageId_idx" ON "matches"("stageId");

-- CreateIndex
CREATE INDEX "matches_groupId_idx" ON "matches"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "match_advancement_edges_toMatchId_slot_key" ON "match_advancement_edges"("toMatchId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "match_advancement_edges_fromMatchId_outcome_key" ON "match_advancement_edges"("fromMatchId", "outcome");

-- CreateIndex
CREATE INDEX "games_matchId_idx" ON "games"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "games_matchId_index_key" ON "games"("matchId", "index");

-- CreateIndex
CREATE INDEX "game_ban_picks_gameId_idx" ON "game_ban_picks"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "game_ban_picks_gameId_order_key" ON "game_ban_picks"("gameId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "game_ban_picks_gameId_championId_key" ON "game_ban_picks"("gameId", "championId");

-- CreateIndex
CREATE INDEX "game_player_stats_registrationId_idx" ON "game_player_stats"("registrationId");

-- CreateIndex
CREATE INDEX "game_player_stats_championId_idx" ON "game_player_stats"("championId");

-- CreateIndex
CREATE UNIQUE INDEX "game_player_stats_gameId_registrationId_key" ON "game_player_stats"("gameId", "registrationId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_slots" ADD CONSTRAINT "team_slots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_slots" ADD CONSTRAINT "team_slots_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_sessions" ADD CONSTRAINT "draft_sessions_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_rounds" ADD CONSTRAINT "draft_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "draft_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "draft_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_events" ADD CONSTRAINT "draft_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "draft_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_team_players" ADD CONSTRAINT "tournament_team_players_tournamentTeamId_fkey" FOREIGN KEY ("tournamentTeamId") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_team_players" ADD CONSTRAINT "tournament_team_players_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tournament_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_group_teams" ADD CONSTRAINT "tournament_group_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tournament_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_advancement_edges" ADD CONSTRAINT "match_advancement_edges_fromMatchId_fkey" FOREIGN KEY ("fromMatchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_advancement_edges" ADD CONSTRAINT "match_advancement_edges_toMatchId_fkey" FOREIGN KEY ("toMatchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_blueTeamId_fkey" FOREIGN KEY ("blueTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_mvpRegistrationId_fkey" FOREIGN KEY ("mvpRegistrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_ban_picks" ADD CONSTRAINT "game_ban_picks_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_ban_picks" ADD CONSTRAINT "game_ban_picks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_player_stats" ADD CONSTRAINT "game_player_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_player_stats" ADD CONSTRAINT "game_player_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_player_stats" ADD CONSTRAINT "game_player_stats_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

