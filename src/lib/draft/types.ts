import type { DraftStatus, Position } from '@prisma/client';

/**
 * Embedded registration reference carried in draft snapshots.
 * `gameId` is flattened by the engine from the nested `player.gameId`.
 */
export type RegistrationRef = {
  id: string;
  nickname: string;
  gameId: string;
  primaryPositions: Position[];
  secondaryPositions: Position[];
  cost: number;
  availability: string;
};

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
  registration: RegistrationRef | null;
};

export type DraftTeamSnapshot = {
  id: string;
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
  registrationId: string;
  position: Position;
  costPaid: number;
  pickedAt: string; // ISO
};

export type DraftSnapshot = {
  session: DraftSessionSnapshot | null;
  teams: DraftTeamSnapshot[];
  pickedRegistrationIds: string[];
  /** Non-revoked picks ordered by (roundNo asc, pickIndex asc). */
  picks: DraftPickSnapshot[];
  // Used by clients to detect staleness; equal to session.seq when session exists.
  seq: number;
};
