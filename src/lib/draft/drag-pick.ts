import type { Position } from '@prisma/client';

export type DraftPickDragData = {
  type: 'pool-player';
  playerId: string;
};

export type DraftPickDropData = {
  position: Position;
  acceptsPick: boolean;
};

export type DraftPickDropIntent = {
  playerId: string;
  position: Position;
};

export function resolveDraftPickDrop(
  activeData: unknown,
  overData: unknown,
): DraftPickDropIntent | null {
  if (!isPickDragData(activeData) || !isPickDropData(overData)) return null;
  if (!overData.acceptsPick) return null;
  return { playerId: activeData.playerId, position: overData.position };
}

function isPickDragData(value: unknown): value is DraftPickDragData {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'pool-player' &&
    typeof (value as { playerId?: unknown }).playerId === 'string'
  );
}

function isPickDropData(value: unknown): value is DraftPickDropData {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { position?: unknown }).position === 'string' &&
    typeof (value as { acceptsPick?: unknown }).acceptsPick === 'boolean'
  );
}
