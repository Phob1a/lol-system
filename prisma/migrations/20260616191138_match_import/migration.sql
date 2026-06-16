-- CreateEnum
CREATE TYPE "MatchImportSource" AS ENUM ('SCRIPT', 'UPLOAD');

-- CreateEnum
CREATE TYPE "MatchImportStatus" AS ENUM ('PENDING', 'COMMITTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "game_player_stats" ADD COLUMN     "extStats" JSONB;

-- CreateTable
CREATE TABLE "match_imports" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "MatchImportSource" NOT NULL,
    "status" "MatchImportStatus" NOT NULL DEFAULT 'PENDING',
    "externalGameId" BIGINT NOT NULL,
    "gameVersion" TEXT,
    "gameMode" TEXT,
    "gameType" TEXT,
    "queueId" INTEGER,
    "mapId" INTEGER,
    "gameCreation" BIGINT,
    "durationSeconds" INTEGER,
    "rawJson" JSONB NOT NULL,
    "committedGameId" TEXT,
    "note" TEXT,

    CONSTRAINT "match_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_imports_status_idx" ON "match_imports"("status");

-- CreateIndex
CREATE INDEX "match_imports_externalGameId_idx" ON "match_imports"("externalGameId");

-- 同一 riot gameId 仅允许一条 COMMITTED 记录（并发去重硬约束；PENDING 允许重复）
CREATE UNIQUE INDEX "match_imports_external_committed_uniq"
  ON "match_imports" ("externalGameId")
  WHERE "status" = 'COMMITTED';
