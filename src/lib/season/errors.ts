export type SeasonErrorCode = 'INVALID_TRANSITION' | 'PRECONDITION_FAILED';

export class SeasonError extends Error {
  constructor(
    public code: SeasonErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SeasonError';
  }
}
