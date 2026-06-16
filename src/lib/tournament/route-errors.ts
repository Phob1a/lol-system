import { NextResponse } from 'next/server';
import { TournamentError } from './errors';

const STATUS: Record<string, number> = {
  TOURNAMENT_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  CONFLICT: 409,
  DOWNSTREAM_RECORDED: 409,
  STANDINGS_TIED: 409,
  FORBIDDEN: 403,
  INVALID_STATE: 422,
  INVALID_CONFIG: 422,
  TEAM_NOT_IN_TOURNAMENT: 422,
  VALIDATION: 422,
};

export function toResponse(err: unknown): NextResponse {
  if (err instanceof TournamentError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: STATUS[err.code] ?? 400 },
    );
  }
  console.error('[tournament] unexpected', err);
  return NextResponse.json({ error: '服务器错误' }, { status: 500 });
}
