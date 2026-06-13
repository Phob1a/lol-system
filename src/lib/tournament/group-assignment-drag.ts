export type GroupDragSource =
  | { teamId: string; from: 'pool' }
  | { teamId: string; from: 'slot'; groupIdx: number; slotIdx: number };

export type GroupDropTarget =
  | { type: 'pool' }
  | { type: 'group'; groupIdx: number }
  | { type: 'slot'; groupIdx: number; slotIdx: number };

export function getUnassignedTeamIds(teamIds: string[], assignments: string[][]): string[] {
  const assigned = new Set(assignments.flat().filter(Boolean));
  return teamIds.filter((id) => !assigned.has(id));
}

export function applyGroupDrop(
  assignments: string[][],
  source: GroupDragSource,
  target: GroupDropTarget | null | undefined,
): string[][] {
  if (!target) return assignments;

  const next = assignments.map((row) => [...row]);

  if (target.type === 'pool') {
    if (source.from === 'slot') {
      next[source.groupIdx][source.slotIdx] = '';
    }
    return next;
  }

  if (target.type === 'group') {
    if (source.from === 'slot' && source.groupIdx === target.groupIdx) return assignments;
    const targetSlotIdx = next[target.groupIdx]?.findIndex((teamId) => teamId === '');
    if (targetSlotIdx === undefined || targetSlotIdx < 0) return assignments;
    if (source.from === 'slot') {
      next[source.groupIdx][source.slotIdx] = '';
    }
    next[target.groupIdx][targetSlotIdx] = source.teamId;
    return removeDuplicateOutsideTarget(next, source.teamId, target.groupIdx, targetSlotIdx);
  }

  const targetValue = next[target.groupIdx]?.[target.slotIdx];
  if (targetValue === undefined) return assignments;

  if (source.from === 'pool') {
    next[target.groupIdx][target.slotIdx] = source.teamId;
    return removeDuplicateOutsideTarget(next, source.teamId, target.groupIdx, target.slotIdx);
  }

  const sourceValue = next[source.groupIdx]?.[source.slotIdx];
  if (sourceValue === undefined) return assignments;
  if (source.groupIdx === target.groupIdx && source.slotIdx === target.slotIdx) return assignments;

  next[source.groupIdx][source.slotIdx] = targetValue || '';
  next[target.groupIdx][target.slotIdx] = source.teamId;
  return next;
}

function removeDuplicateOutsideTarget(
  assignments: string[][],
  teamId: string,
  targetGroupIdx: number,
  targetSlotIdx: number,
): string[][] {
  return assignments.map((row, gi) =>
    row.map((id, si) => (id === teamId && !(gi === targetGroupIdx && si === targetSlotIdx) ? '' : id)),
  );
}
