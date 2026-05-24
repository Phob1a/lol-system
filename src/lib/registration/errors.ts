export type RegistrationErrorCode =
  | 'REGISTRATION_CLOSED'
  | 'DUPLICATE_GAME_ID'
  | 'NOT_FOUND'
  | 'SEASON_LOCKED';

export class RegistrationError extends Error {
  constructor(
    public code: RegistrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}
