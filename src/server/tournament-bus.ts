import { EventEmitter } from 'node:events';

type ChannelEvent =
  | { type: 'state.invalidated'; tournamentId: string; seq: number }
  | { type: 'tournament.reset'; tournamentId: string };

const GLOBAL_KEY = '__lol_tournament_bus__';
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;
if (!g[GLOBAL_KEY]) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  g[GLOBAL_KEY] = emitter;
}
const bus = g[GLOBAL_KEY] as EventEmitter;

export function publish(event: ChannelEvent): void {
  bus.emit('event', event);
}

export function subscribe(handler: (event: ChannelEvent) => void): () => void {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
