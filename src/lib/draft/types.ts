import type { DraftStatus, Position } from '@prisma/client';
import type { PlayerRef } from '@/lib/teams/preview';

export type DraftSessionSnapshot = {
  id: string;
  status: DraftStatus;
  currentRound: number;
  onTheClock: string | null;
  seq: number;
  startedAt: string | null; // ISO string for JSON safety
};

export type DraftTeamSlotSnapshot = {
  id: string;
  position: Position;
  player: PlayerRef | null;
};

export type DraftTeamSnapshot = {
  id: string;
  name: string;
  captainId: string;
  captainGameId: string;
  captainNickname: string;
  budgetLeft: number;
  slots: DraftTeamSlotSnapshot[];
};

export type DraftPickSnapshot = {
  id: string;
  roundNo: number;
  pickIndex: number;
  byCaptainId: string;
  teamId: string;
  playerId: string;
  position: Position;
  costPaid: number;
  pickedAt: string; // ISO
};

export type DraftSnapshot = {
  session: DraftSessionSnapshot | null;
  teams: DraftTeamSnapshot[];
  pickedPlayerIds: string[];
  /** Non-revoked picks ordered by (roundNo asc, pickIndex asc). */
  picks: DraftPickSnapshot[];
  // Used by clients to detect staleness; equal to session.seq when session exists.
  seq: number;
};
