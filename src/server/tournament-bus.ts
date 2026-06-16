import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for tournament state changes.
 *
 * Mirrors draft-bus.ts — single-instance only. For multi-instance deployments,
 * swap to Redis pub/sub. Out of scope for current tournament scale.
 */

type ChannelEvent = { type: 'tournament.invalidated' };

const GLOBAL_KEY = '__lol_tournament_bus__';
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;

if (!g[GLOBAL_KEY]) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  g[GLOBAL_KEY] = emitter;
}

const bus = g[GLOBAL_KEY] as EventEmitter;

export function publishTournament(event: ChannelEvent): void {
  bus.emit('event', event);
}

export function subscribeTournament(handler: (event: ChannelEvent) => void): () => void {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
