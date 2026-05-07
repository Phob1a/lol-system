import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for draft state changes.
 *
 * Single-instance only: works on Vercel as long as we deploy as a Node server
 * (`output: 'standalone'`) without horizontal scaling. For multi-instance, swap
 * to Redis pub/sub or a queue. Out of scope for the current draft scale (one
 * draft, ~10 captains).
 *
 * Why SSE+EventEmitter instead of Socket.IO (per the planner's recommendation):
 *   - We need server→client broadcasts only; clients write through HTTP routes.
 *   - SSE is native to Next.js App Router; no custom server, no extra deps.
 *   - One ChannelEvent fan-out is well below SSE's per-tab connection limit.
 */

type ChannelEvent =
  | { type: 'state.invalidated'; seq: number }
  | { type: 'draft.reset' };

const GLOBAL_KEY = '__lol_draft_bus__';
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;

if (!g[GLOBAL_KEY]) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // we expect many SSE subscribers
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
