import { randomInt } from 'node:crypto';

const CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PWD_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pick(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/** A team-account username, e.g. "TEAM-A3F9". Caller must ensure uniqueness. */
export function generateUsername(): string {
  return `TEAM-${pick(CODE_ALPHABET, 4)}`;
}

/** A 10-char alphanumeric password (shown to admin once, then only hash stored). */
export function generatePassword(): string {
  return pick(PWD_ALPHABET, 10);
}
