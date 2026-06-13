export type TournamentErrorCode =
  | 'SEASON_NOT_FOUND'
  | 'TOURNAMENT_EXISTS'
  | 'TOURNAMENT_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'INVALID_STATE'
  | 'FORBIDDEN'
  | 'TEAM_NOT_IN_SEASON'
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
