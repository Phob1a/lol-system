import { getSession } from '@/lib/auth';
import { subscribe } from '@/server/tournament-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;
const encoder = new TextEncoder();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });
  const { id: tournamentId } = await ctx.params;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      send('hello', { ts: Date.now(), tournamentId });
      const unsub = subscribe((evt) => {
        if ('tournamentId' in evt && evt.tournamentId === tournamentId) {
          send('tournament', evt);
        }
      });
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { closed = true; }
      }, HEARTBEAT_MS);
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', cleanup);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
