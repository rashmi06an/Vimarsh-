import { createHash, randomBytes, randomInt } from 'crypto';

/**
 * Deterministic SHA-256 over a canonical JSON serialisation.
 * Keys are sorted recursively so the same logical object always hashes identically.
 * This is the backbone of the append-only audit chain.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Hash an arbitrary token (refresh token, invitation token) for at-rest storage. */
export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** Opaque random token (URL-safe) for refresh tokens and invitation deep links. */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric OTP of the given length (default 6), cryptographically random. */
export function generateOtp(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

/** Meeting code in the official format VMR-<year>-XXXXXX (A–Z, 2–9, no ambiguous chars). */
export function generateMeetingCode(year = new Date().getFullYear()): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += alphabet[randomInt(0, alphabet.length)];
  return `VMR-${year}-${suffix}`;
}
