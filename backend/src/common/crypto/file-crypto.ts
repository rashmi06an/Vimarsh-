/**
 * Application-level encryption at rest for uploaded files (documents).
 *
 * Algorithm: AES-256-GCM (authenticated encryption).
 *  - 32-byte key, supplied via env (DOCUMENT_ENCRYPTION_KEY), never hardcoded.
 *  - A fresh random 12-byte IV (nonce) is generated per file (never reused with the same key).
 *  - The 16-byte GCM authentication tag is stored alongside the object; decryption fails
 *    (throws) if the ciphertext or tag was tampered with — integrity + confidentiality.
 *
 * The plaintext never touches disk: the backend encrypts in memory on upload and only
 * decrypts in memory on an authorized download. The object stored in MinIO is ciphertext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const ENC_ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32; // AES-256

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: Buffer; // 12 bytes
  authTag: Buffer; // 16 bytes
}

/**
 * Parse the configured key. Accepts a 64-char hex string or a base64 string that decodes
 * to exactly 32 bytes. Throws a clear error if missing or the wrong length, so the service
 * fails loudly rather than storing weakly/unencrypted data.
 */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  if (!raw || raw.trim() === '') {
    throw new Error(
      'DOCUMENT_ENCRYPTION_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const val = raw.trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(val)) {
    key = Buffer.from(val, 'hex');
  } else {
    const b64 = Buffer.from(val, 'base64');
    if (b64.length === KEY_BYTES) key = b64;
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64 of 32 bytes).');
  }
  return key;
}

export function encryptBuffer(plaintext: Buffer, key: Buffer): EncryptedBlob {
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes (AES-256).');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENC_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptBuffer(ciphertext: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes (AES-256).');
  const decipher = createDecipheriv(ENC_ALGO, key, iv);
  decipher.setAuthTag(authTag); // throws on decrypt if the data/tag was altered
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
