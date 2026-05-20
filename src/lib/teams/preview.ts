import type { Position } from '@prisma/client';
import { POSITIONS } from '@/lib/players/schema';

export type RegistrationRef = {
  id: string;
  gameId: string;
  nickname: string;
  primaryPositions: Position[];
  cost: number;
};

export type TeamSlotPreview = {
  position: Position;
  player: RegistrationRef | null;
};

export type TeamPreview = {
  captainId: string;
  captainGameId: string;
  captainNickname: string;
  budgetLeft: number;
  slots: TeamSlotPreview[]; // always length 5, in POSITIONS order
};

/**
 * Deterministic captain slot assignment for the pre-draft preview.
 * Picks the first matching position in POSITIONS enum order from the captain's
 * primaryPositions list. Falls back to TOP if (somehow) primaryPositions is empty.
 */
export function pickCaptainSlot(captain: { primaryPositions: Position[] }): Position {
  for (const pos of POSITIONS) {
    if (captain.primaryPositions.includes(pos)) return pos as Position;
  }
  return 'TOP';
}

/**
 * Build the per-team preview shown to captains and admin before the draft starts.
 * Captains are auto-placed in one slot matching their primary position, with the
 * team budget debited by the captain's cost. All other slots are empty.
 */
export function computeTeamPreviews(
  captains: RegistrationRef[],
  teamBudget: number,
): TeamPreview[] {
  return captains.map((captain): TeamPreview => {
    const captainSlot = pickCaptainSlot(captain);
    const slots: TeamSlotPreview[] = (POSITIONS as readonly Position[]).map((pos) => ({
      position: pos,
      player: pos === captainSlot ? captain : null,
    }));
    return {
      captainId: captain.id,
      captainGameId: captain.gameId,
      captainNickname: captain.nickname,
      budgetLeft: teamBudget - captain.cost,
      slots,
    };
  });
}
