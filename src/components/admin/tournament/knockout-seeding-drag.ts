export type KnockoutSeedSlotState = {
  matchId: string;
  slot: 'A' | 'B';
  teamId: string | null;
};

export type KnockoutSeedDragSource =
  | { teamId: string; from: 'pool' }
  | { teamId: string; from: 'slot'; matchId: string; slot: 'A' | 'B' };

export type KnockoutSeedDropTarget =
  | { type: 'pool' }
  | { type: 'slot'; matchId: string; slot: 'A' | 'B' };

export function getUnassignedSeedCandidateIds(teamIds: string[], slots: KnockoutSeedSlotState[]): string[] {
  const assigned = new Set(slots.map((slot) => slot.teamId).filter((teamId): teamId is string => teamId !== null));
  return teamIds.filter((teamId) => !assigned.has(teamId));
}

export function applyKnockoutSeedDrop(
  slots: KnockoutSeedSlotState[],
  source: KnockoutSeedDragSource,
  target: KnockoutSeedDropTarget | null | undefined,
): KnockoutSeedSlotState[] {
  if (!target) return slots;

  if (target.type === 'pool') {
    if (source.from !== 'slot') return slots;
    const sourceIdx = findSlotIndex(slots, source.matchId, source.slot);
    if (sourceIdx < 0) return slots;
    return slots.map((slot, index) => (index === sourceIdx ? { ...slot, teamId: null } : { ...slot }));
  }

  const targetIdx = findSlotIndex(slots, target.matchId, target.slot);
  if (targetIdx < 0) return slots;

  if (source.from === 'pool') {
    const next = slots.map((slot) => ({ ...slot }));
    next[targetIdx].teamId = source.teamId;
    return removeDuplicateOutsideTarget(next, source.teamId, targetIdx);
  }

  const sourceIdx = findSlotIndex(slots, source.matchId, source.slot);
  if (sourceIdx < 0) return slots;
  if (sourceIdx === targetIdx) return slots;

  const next = slots.map((slot) => ({ ...slot }));
  const targetTeamId = next[targetIdx].teamId;
  next[sourceIdx].teamId = targetTeamId;
  next[targetIdx].teamId = source.teamId;
  return next;
}

function findSlotIndex(slots: KnockoutSeedSlotState[], matchId: string, slot: 'A' | 'B'): number {
  return slots.findIndex((item) => item.matchId === matchId && item.slot === slot);
}

function removeDuplicateOutsideTarget(
  slots: KnockoutSeedSlotState[],
  teamId: string,
  targetIdx: number,
): KnockoutSeedSlotState[] {
  return slots.map((slot, index) => (slot.teamId === teamId && index !== targetIdx ? { ...slot, teamId: null } : slot));
}
