export type CaptainErrorCode =
  | 'WRONG_TOURNAMENT_STATE'
  | 'NOT_FOUND'
  | 'ALREADY_CAPTAIN'
  | 'NOT_A_CAPTAIN'
  | 'DRAFT_ALREADY_STARTED';

export class CaptainError extends Error {
  constructor(
    public code: CaptainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CaptainError';
  }
}
