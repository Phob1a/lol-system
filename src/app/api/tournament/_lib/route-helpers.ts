import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { TournamentStateError, ConcurrencyError } from '@/lib/tournament/tournament-events';

export function mapError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'validation failed', issues: e.issues }, { status: 400 });
  }
  if (e instanceof ConcurrencyError) {
    return NextResponse.json({ error: e.message, code: 'CONCURRENCY' }, { status: 409 });
  }
  if (e instanceof TournamentStateError) {
    const status =
      e.code === 'UNRESOLVED_TIES' ? 422 :
      e.code === 'DOWNSTREAM_BLOCKED' ? 422 :
      e.code === 'NOT_FOUND' ? 404 :
      409;
    const body: Record<string, unknown> = { error: e.message, code: e.code };
    const tieGroups = (e as TournamentStateError & { tieGroups?: unknown }).tieGroups;
    if (tieGroups) body.tieGroups = tieGroups;
    return NextResponse.json(body, { status });
  }
  console.error('tournament route error', e);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
