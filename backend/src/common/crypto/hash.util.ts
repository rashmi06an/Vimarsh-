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

// ---------------------------------------------------------------------------
// Admin invite codes (QR-based onboarding). The admin generates a code, a new
// member scans/types it to register. The code is a SECRET: we store only its
// SHA-256 hash, never the plaintext.
// ---------------------------------------------------------------------------

// Unambiguous alphabet — no 0/O, 1/I/L, so a code is easy to read off a screen
// and to type by hand if the camera cannot scan the QR.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Cryptographically-random invite code (default 16 chars ≈ 79 bits of entropy). */
export function generateInviteCode(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) out += INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)];
  return out;
}

/**
 * Canonicalise a scanned or hand-typed invite code so the QR path and the
 * manual-entry path always hash to the same value: uppercase, strip anything
 * that is not a letter or digit (spaces, dashes, a `vimarsh://invite/` prefix…).
 */
export function normalizeInviteCode(raw: string): string {
  return (raw ?? '')
    .toUpperCase()
    .replace(/VIMARSH:\/\/INVITE\//g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Pretty-print a code as XXXX-XXXX-XXXX-XXXX for display and QR encoding. */
export function formatInviteCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}
