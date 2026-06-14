export type TournamentErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'TEAM_NOT_IN_TOURNAMENT'
  | 'TEAM_NOT_IN_SEASON' // deferred: still used by schedule-service until its task lands
  | 'MATCH_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DOWNSTREAM_RECORDED'
  | 'STANDINGS_TIED'
  | 'VALIDATION';

export class TournamentError extends Error {
  constructor(
    public code: TournamentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}
