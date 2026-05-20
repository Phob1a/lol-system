-- CreateEnum
CREATE TYPE "Position" AS ENUM ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CAPTAIN');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('SETUP', 'REGISTRATION', 'ROSTER_LOCKED', 'DRAFTING', 'COMPLETED', 'ARCHIVED');

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

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'SETUP',
    "teamBudget" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

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
    "seasonId" TEXT NOT NULL,
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
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetLeft" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "seasonId" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "players_gameId_key" ON "players"("gameId");

-- CreateIndex
CREATE INDEX "registrations_seasonId_idx" ON "registrations"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_seasonId_playerId_key" ON "registrations"("seasonId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "teams_captainId_key" ON "teams"("captainId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_userId_key" ON "teams"("userId");

-- CreateIndex
CREATE INDEX "teams_seasonId_idx" ON "teams"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "team_slots_teamId_position_key" ON "team_slots"("teamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "draft_sessions_seasonId_key" ON "draft_sessions"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_rounds_sessionId_roundNo_key" ON "draft_rounds"("sessionId", "roundNo");

-- CreateIndex
CREATE INDEX "draft_events_sessionId_createdAt_idx" ON "draft_events"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "draft_events_sessionId_seq_key" ON "draft_events"("sessionId", "seq");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_slots" ADD CONSTRAINT "team_slots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_slots" ADD CONSTRAINT "team_slots_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_sessions" ADD CONSTRAINT "draft_sessions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
